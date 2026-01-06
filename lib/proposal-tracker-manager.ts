/**
 * Singleton manager for proposal tracking sessions.
 * Ensures only one tracking session exists per proposal.
 */

import { MS_PER_MINUTE } from "@/lib/date-utils";
import { debug } from "@/lib/debug";
import type {
  ProposalStage,
  ProposalTrackingResult,
} from "@/types/proposal-stage";

/** Status of a proposal tracking session */
export type TrackingStatus =
  | "idle"
  | "queued"
  | "loading"
  | "complete"
  | "error";

/** A proposal tracking session with its current state */
export interface TrackingSession {
  /** The proposal ID being tracked */
  proposalId: string;
  /** The governor contract address */
  governorAddress: string;
  /** Current status of the tracking session */
  status: TrackingStatus;
  /** Array of stages tracked so far */
  stages: ProposalStage[];
  /** Current stage index (-1 if not started) */
  currentStageIndex: number;
  /** Final tracking result when complete */
  result: ProposalTrackingResult | null;
  /** Error message if tracking failed */
  error: string | null;
  /** Stage index to refresh from (for incremental refresh) */
  refreshingFromIndex: number | null;
  /** Callbacks to notify on state changes */
  subscribers: Set<(session: TrackingSession) => void>;
  /** Controller for canceling tracking */
  abortController: AbortController | null;
  /** Position in queue (null if not queued) */
  queuePosition: number | null;
  /** Timestamp of last update */
  lastUpdatedAt: number;
  /** Whether a background refresh is in progress */
  isBackgroundRefreshing: boolean;
}

/** Item waiting in the tracking queue */
export interface QueuedItem {
  /** Session key for lookup */
  key: SessionKey;
  /** The proposal ID */
  proposalId: string;
  /** The governor contract address */
  governorAddress: string;
  /** Function to call when ready to start tracking */
  startTracking: () => void;
}

type SessionKey = string;

/**
 * Generate a session key from proposal and governor
 *
 * @param proposalId - The proposal ID
 * @param governorAddress - The governor contract address
 * @returns Unique session key string
 */
function getSessionKey(
  proposalId: string,
  governorAddress: string
): SessionKey {
  return `${governorAddress.toLowerCase()}-${proposalId}`;
}

/** Maximum number of concurrent tracking sessions */
const MAX_CONCURRENT_TRACKING = 2;

/**
 * Manages proposal tracking sessions with queuing and concurrency control
 *
 * Ensures only one tracking session exists per proposal and limits
 * concurrent tracking to avoid overwhelming RPC endpoints.
 */
class ProposalTrackerManager {
  /** Maximum number of sessions before forced cleanup */
  private static readonly MAX_SESSIONS = 100;
  /** Threshold to trigger cleanup of stale sessions */
  private static readonly CLEANUP_THRESHOLD = 50;

  private sessions: Map<SessionKey, TrackingSession> = new Map();
  private queue: QueuedItem[] = [];
  private activeCount = 0;
  private globalSubscribers: Set<() => void> = new Set();

  getSession(
    proposalId: string,
    governorAddress: string
  ): TrackingSession | undefined {
    const key = getSessionKey(proposalId, governorAddress);
    return this.sessions.get(key);
  }

  getAllSessions(): TrackingSession[] {
    return Array.from(this.sessions.values());
  }

  getQueueLength(): number {
    return this.queue.length;
  }

  getActiveCount(): number {
    return this.activeCount;
  }

  createSession(proposalId: string, governorAddress: string): TrackingSession {
    // Cleanup stale sessions when we exceed the threshold
    if (this.sessions.size >= ProposalTrackerManager.CLEANUP_THRESHOLD) {
      this.cleanupStaleSessions();
    }

    const key = getSessionKey(proposalId, governorAddress);

    // Return existing session if it exists
    const existing = this.sessions.get(key);
    if (existing) {
      return existing;
    }

    const session: TrackingSession = {
      proposalId,
      governorAddress,
      status: "idle",
      stages: [],
      currentStageIndex: -1,
      result: null,
      error: null,
      refreshingFromIndex: null,
      subscribers: new Set(),
      abortController: null,
      queuePosition: null,
      lastUpdatedAt: Date.now(),
      isBackgroundRefreshing: false,
    };

    this.sessions.set(key, session);
    return session;
  }

  updateSession(
    proposalId: string,
    governorAddress: string,
    updates: Partial<
      Omit<TrackingSession, "subscribers" | "proposalId" | "governorAddress">
    >
  ): void {
    const key = getSessionKey(proposalId, governorAddress);
    const session = this.sessions.get(key);
    if (!session) return;

    Object.assign(session, updates, { lastUpdatedAt: Date.now() });
    this.notifySubscribers(session);
  }

  subscribe(
    proposalId: string,
    governorAddress: string,
    callback: (session: TrackingSession) => void
  ): () => void {
    const key = getSessionKey(proposalId, governorAddress);
    let session = this.sessions.get(key);

    if (!session) {
      session = this.createSession(proposalId, governorAddress);
    }

    session.subscribers.add(callback);

    // Immediately notify with current state
    callback(session);

    // Return unsubscribe function
    return () => {
      session?.subscribers.delete(callback);
    };
  }

  subscribeGlobal(callback: () => void): () => void {
    this.globalSubscribers.add(callback);
    return () => {
      this.globalSubscribers.delete(callback);
    };
  }

  private notifySubscribers(session: TrackingSession): void {
    session.subscribers.forEach((callback) => {
      try {
        callback(session);
      } catch (e) {
        debug.stageTracker("subscriber error: %O", e);
      }
    });
  }

  private notifyGlobalSubscribers(): void {
    this.globalSubscribers.forEach((callback) => {
      try {
        callback();
      } catch (e) {
        debug.stageTracker("global subscriber error: %O", e);
      }
    });
  }

  private updateQueuePositions(): void {
    this.queue.forEach((item, index) => {
      const session = this.sessions.get(item.key);
      if (session && session.status === "queued") {
        session.queuePosition = index + 1;
        this.notifySubscribers(session);
      }
    });
  }

  requestTracking(
    proposalId: string,
    governorAddress: string,
    startTrackingFn: () => void
  ): void {
    const key = getSessionKey(proposalId, governorAddress);
    const session = this.sessions.get(key);

    if (!session) return;

    if (session.status === "loading" || session.status === "complete") {
      return;
    }

    if (session.status === "queued") {
      return;
    }

    if (this.activeCount < MAX_CONCURRENT_TRACKING) {
      this.activeCount++;
      session.status = "loading";
      session.queuePosition = null;
      this.notifySubscribers(session);
      this.notifyGlobalSubscribers();
      startTrackingFn();
    } else {
      const queueItem: QueuedItem = {
        key,
        proposalId,
        governorAddress,
        startTracking: startTrackingFn,
      };
      this.queue.push(queueItem);
      session.status = "queued";
      session.queuePosition = this.queue.length;
      this.notifySubscribers(session);
      this.notifyGlobalSubscribers();
    }
  }

  trackingFinished(proposalId: string, governorAddress: string): void {
    const key = getSessionKey(proposalId, governorAddress);
    const session = this.sessions.get(key);

    if (session?.status === "loading") {
      this.activeCount = Math.max(0, this.activeCount - 1);
      this.notifyGlobalSubscribers();
      this.processQueue();
    }
  }

  private processQueue(): void {
    while (
      this.activeCount < MAX_CONCURRENT_TRACKING &&
      this.queue.length > 0
    ) {
      const item = this.queue.shift();
      if (!item) break;

      const session = this.sessions.get(item.key);
      if (!session) continue;

      if (session.status !== "queued") {
        continue;
      }

      this.activeCount++;
      session.status = "loading";
      session.queuePosition = null;
      this.notifySubscribers(session);
      item.startTracking();
    }

    this.updateQueuePositions();
    this.notifyGlobalSubscribers();
  }

  isTracking(proposalId: string, governorAddress: string): boolean {
    const session = this.getSession(proposalId, governorAddress);
    return session?.status === "loading";
  }

  isQueued(proposalId: string, governorAddress: string): boolean {
    const session = this.getSession(proposalId, governorAddress);
    return session?.status === "queued";
  }

  abortTracking(proposalId: string, governorAddress: string): void {
    const key = getSessionKey(proposalId, governorAddress);
    const session = this.sessions.get(key);
    if (!session) return;

    if (session.status === "queued") {
      this.queue = this.queue.filter((item) => item.key !== key);
      session.status = "idle";
      session.queuePosition = null;
      this.updateQueuePositions();
      this.notifySubscribers(session);
      this.notifyGlobalSubscribers();
      return;
    }

    if (session.abortController) {
      session.abortController.abort();
      session.abortController = null;
      this.activeCount = Math.max(0, this.activeCount - 1);
      this.processQueue();
    }
  }

  clearSession(proposalId: string, governorAddress: string): void {
    const key = getSessionKey(proposalId, governorAddress);
    const session = this.sessions.get(key);
    if (session) {
      if (session.status === "queued") {
        this.queue = this.queue.filter((item) => item.key !== key);
        this.updateQueuePositions();
      }
      if (session.status === "loading" && session.abortController) {
        session.abortController.abort();
        this.activeCount = Math.max(0, this.activeCount - 1);
      }
      this.sessions.delete(key);
      this.notifyGlobalSubscribers();
      this.processQueue();
    }
  }

  /**
   * Remove stale sessions that are complete or errored and older than maxAgeMs
   * @param maxAgeMs - Maximum age in milliseconds (default: 30 minutes)
   * @returns Number of sessions cleaned up
   */
  cleanupStaleSessions(maxAgeMs: number = 30 * MS_PER_MINUTE): number {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [key, session] of Array.from(this.sessions.entries())) {
      if (
        (session.status === "complete" || session.status === "error") &&
        session.subscribers.size === 0 &&
        now - session.lastUpdatedAt > maxAgeMs
      ) {
        this.sessions.delete(key);
        cleanedCount++;
      }
    }

    return cleanedCount;
  }
}

/** Vote update event with current vote counts */
export interface VoteUpdate {
  /** The proposal ID */
  proposalId: string;
  /** The governor contract address */
  governorAddress: string;
  /** Current "for" votes in wei */
  forVotes: string;
  /** Current "against" votes in wei */
  againstVotes: string;
  /** Current "abstain" votes in wei */
  abstainVotes: string;
}

/** Callback type for vote update subscriptions */
export type VoteUpdateCallback = (update: VoteUpdate) => void;

/** Singleton instance of the tracker manager */
export const trackerManager = new ProposalTrackerManager();

/** Vote update subscribers (separate from tracking sessions) */
const voteUpdateSubscribers = new Set<VoteUpdateCallback>();

/**
 * Subscribe to vote update events
 *
 * @param callback - Function to call when votes are updated
 * @returns Unsubscribe function
 */
export function subscribeToVoteUpdates(
  callback: VoteUpdateCallback
): () => void {
  voteUpdateSubscribers.add(callback);
  return () => {
    voteUpdateSubscribers.delete(callback);
  };
}

/**
 * Emit a vote update to all subscribers
 *
 * @param update - The vote update event to emit
 */
export function emitVoteUpdate(update: VoteUpdate): void {
  voteUpdateSubscribers.forEach((callback) => {
    try {
      callback(update);
    } catch (e) {
      debug.stageTracker("vote update subscriber error: %O", e);
    }
  });
}
