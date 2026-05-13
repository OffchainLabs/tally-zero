/**
 * Gov-tracker cache integration for TallyZero
 *
 * Uses gov-tracker's LocalStorageCache with TallyZero's prefix
 * for caching TrackingCheckpoints in localStorage.
 */

import { DEFAULT_CACHE_TTL_MS, STORAGE_KEYS } from "@/config/storage-keys";
import type { ProposalTrackingResult } from "@/types/proposal-stage";
import {
  extractTimelockLinkFromStages,
  getVotingDataFromStages,
  isCheckpointComplete,
  trimFromStage,
  txHashCacheKey,
  type CacheAdapter,
  type GovernorTrackingInput,
  type TrackedStage,
  type TrackingCheckpoint,
} from "@gzeoneth/gov-tracker";
import { debug } from "./debug";

// Re-export txHashCacheKey for external use
export { txHashCacheKey };

class BestEffortLocalStorageCache implements CacheAdapter {
  constructor(private readonly prefix: string) {}

  private fullKey(key: string): string {
    return `${this.prefix}${key}`;
  }

  private getStorage(): Storage | null {
    if (typeof globalThis === "undefined") return null;
    return typeof globalThis.localStorage !== "undefined"
      ? globalThis.localStorage
      : null;
  }

  async get<T>(key: string): Promise<T | null> {
    const storage = this.getStorage();
    if (!storage) return null;

    const data = storage.getItem(this.fullKey(key));
    if (data === null) return null;

    try {
      return JSON.parse(data) as T;
    } catch {
      return null;
    }
  }

  async set<T>(key: string, value: T): Promise<void> {
    const storage = this.getStorage();
    if (!storage) return;

    const fullKey = this.fullKey(key);
    const serialized = JSON.stringify(value);

    try {
      storage.setItem(fullKey, serialized);
      return;
    } catch (err) {
      if (!isStorageQuotaError(err)) {
        debug.cache("checkpoint cache write skipped for %s: %O", key, err);
        return;
      }
    }

    const removedCount = pruneCheckpointEntriesForRetry(
      storage,
      this.prefix,
      fullKey,
      serialized.length
    );

    try {
      storage.setItem(fullKey, serialized);
    } catch (err) {
      debug.cache(
        "checkpoint cache quota exceeded for %s (%d KiB, pruned %d entries); continuing without persisting",
        key,
        Math.ceil(serialized.length / 1024),
        removedCount
      );
    }
  }

  async delete(key: string): Promise<void> {
    const storage = this.getStorage();
    if (!storage) return;
    storage.removeItem(this.fullKey(key));
  }

  async clear(): Promise<void> {
    const storage = this.getStorage();
    if (!storage) return;

    for (const key of getStorageKeys(storage)) {
      if (key.startsWith(this.prefix)) {
        storage.removeItem(key);
      }
    }
  }

  async has(key: string): Promise<boolean> {
    const storage = this.getStorage();
    if (!storage) return false;
    return storage.getItem(this.fullKey(key)) !== null;
  }

  async keys(prefix?: string): Promise<string[]> {
    const storage = this.getStorage();
    if (!storage) return [];

    const keys: string[] = [];
    for (const fullKey of getStorageKeys(storage)) {
      if (!fullKey.startsWith(this.prefix)) continue;
      const key = fullKey.slice(this.prefix.length);
      if (!prefix || key.startsWith(prefix)) {
        keys.push(key);
      }
    }
    return keys;
  }
}

function isStorageQuotaError(err: unknown): boolean {
  if (typeof DOMException !== "undefined" && err instanceof DOMException) {
    return (
      err.name === "QuotaExceededError" ||
      err.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
      err.code === 22 ||
      err.code === 1014
    );
  }

  if (err instanceof Error) {
    const message = err.message.toLowerCase();
    return message.includes("quota") || message.includes("exceeded");
  }

  return false;
}

function getStorageKeys(storage: Storage): string[] {
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key) keys.push(key);
  }
  return keys;
}

function pruneCheckpointEntriesForRetry(
  storage: Storage,
  prefix: string,
  incomingFullKey: string,
  incomingLength: number
): number {
  const entries = getStorageKeys(storage)
    .filter((key) => key.startsWith(prefix))
    .map((key) => ({
      key,
      size: storage.getItem(key)?.length ?? 0,
    }))
    .sort((a, b) => b.size - a.size);

  let removed = 0;
  let reclaimed = 0;
  const target = Math.max(incomingLength, 512 * 1024);

  if (storage.getItem(incomingFullKey) !== null) {
    reclaimed += storage.getItem(incomingFullKey)?.length ?? 0;
    storage.removeItem(incomingFullKey);
    removed++;
  }

  for (const entry of entries) {
    if (reclaimed >= target) break;
    if (entry.key === incomingFullKey) continue;
    storage.removeItem(entry.key);
    reclaimed += entry.size;
    removed++;
  }

  return removed;
}

/**
 * Singleton cache adapter instance with TallyZero's prefix.
 */
let cacheInstance: CacheAdapter | null = null;

/**
 * Get the shared cache adapter instance
 *
 * Uses localStorage with TallyZero's checkpoint prefix.
 * Writes are best-effort so browser quota issues do not break tracking UI.
 */
export function getCacheAdapter(): CacheAdapter {
  if (!cacheInstance) {
    cacheInstance = new BestEffortLocalStorageCache(
      STORAGE_KEYS.CHECKPOINT_CACHE_PREFIX
    );
  }
  return cacheInstance;
}

/**
 * Seed gov-tracker cache from existing tracked stages
 *
 * Converts stages to a TrackingCheckpoint and stores it,
 * enabling gov-tracker to resume from where tracking left off.
 *
 * @param cache - The cache adapter to seed
 * @param proposalId - The proposal ID
 * @param governorAddress - The governor address
 * @param creationTxHash - The creation transaction hash
 * @param stages - The tracked stages
 */
export async function seedCheckpointFromStages(
  cache: CacheAdapter,
  proposalId: string,
  governorAddress: string,
  creationTxHash: string,
  stages: TrackedStage[]
): Promise<void> {
  if (stages.length === 0) return;

  const key = txHashCacheKey(creationTxHash);

  const lastStage = stages[stages.length - 1];
  const transactions = lastStage.transactions ?? [];
  const lastTx =
    transactions.length > 0 ? transactions[transactions.length - 1] : undefined;

  const checkpoint: TrackingCheckpoint = {
    version: 1,
    createdAt: Date.now(),
    input: {
      type: "governor",
      governorAddress,
      proposalId,
      creationTxHash,
    },
    lastProcessedStage: lastStage.type,
    lastProcessedBlock: {
      l1: 0,
      l2: lastTx?.blockNumber ?? 0,
    },
    cachedData: {
      completedStages: stages.filter((s) => s.status === "COMPLETED"),
    },
    metadata: {
      errorCount: 0,
      lastTrackedAt: Date.now(),
    },
  };

  await cache.set(key, checkpoint);
  debug.cache(
    "seeded checkpoint for %s with %d completed stages",
    proposalId,
    checkpoint.cachedData.completedStages?.length ?? 0
  );
}

/**
 * Clear gov-tracker checkpoint for a proposal
 *
 * @param cache - The cache adapter
 * @param creationTxHash - The creation transaction hash
 */
export async function clearProposalCheckpoint(
  cache: CacheAdapter,
  creationTxHash: string
): Promise<void> {
  const key = txHashCacheKey(creationTxHash);
  await cache.delete(key);
}

/**
 * Result of loading cached proposal stages
 */
export interface CachedProposalResult {
  /** Tracking result if found in cache */
  result: ProposalTrackingResult | null;
  /** Whether the cache entry is expired */
  isExpired: boolean;
  /** Whether tracking is complete (no refresh needed) */
  isComplete: boolean;
  /** Timestamp when cached */
  cachedAt: number | null;
}

/**
 * Load proposal tracking result from gov-tracker checkpoint cache
 *
 * Reads directly from gov-tracker's LocalStorageCache and converts
 * the checkpoint to a ProposalTrackingResult for UI display.
 *
 * @param creationTxHash - The creation transaction hash
 * @param governorAddress - The governor address (unused, kept for API compatibility)
 * @param ttlMs - Cache TTL in milliseconds
 */
export async function loadCachedProposal(
  creationTxHash: string,
  _governorAddress: string,
  ttlMs: number = DEFAULT_CACHE_TTL_MS
): Promise<CachedProposalResult> {
  const cache = getCacheAdapter();
  const key = txHashCacheKey(creationTxHash);
  const checkpoint = await cache.get<TrackingCheckpoint>(key);

  // Only handle governor checkpoints (not timelock checkpoints)
  if (
    !checkpoint ||
    !checkpoint.input ||
    checkpoint.input.type !== "governor"
  ) {
    return {
      result: null,
      isExpired: false,
      isComplete: false,
      cachedAt: null,
    };
  }

  const input = checkpoint.input as GovernorTrackingInput;
  const stages = checkpoint.cachedData?.completedStages ?? [];
  if (stages.length === 0) {
    return {
      result: null,
      isExpired: false,
      isComplete: false,
      cachedAt: checkpoint.createdAt,
    };
  }

  // Use gov-tracker's isCheckpointComplete - it handles all terminal states
  const isComplete = isCheckpointComplete(checkpoint);

  // Check TTL expiration
  const cachedAt = checkpoint.metadata?.lastTrackedAt ?? checkpoint.createdAt;
  const isExpired = !isComplete && Date.now() - cachedAt > ttlMs;

  // Use gov-tracker utilities for extracting data
  const timelockLink = extractTimelockLinkFromStages(stages);
  const votingData = getVotingDataFromStages(stages);
  const currentState = votingData?.proposalState;

  // Convert checkpoint to ProposalTrackingResult
  const result: ProposalTrackingResult = {
    proposalId: input.proposalId,
    creationTxHash: input.creationTxHash,
    governorAddress: input.governorAddress,
    stages,
    timelockLink,
    isComplete,
    currentState,
  };

  debug.cache(
    "loaded checkpoint for %s: %d stages, complete=%s, expired=%s",
    creationTxHash.slice(0, 10),
    stages.length,
    isComplete,
    isExpired
  );

  return {
    result,
    isExpired,
    isComplete,
    cachedAt,
  };
}

/**
 * Trim cached stages from a specific index
 *
 * Uses gov-tracker's trimFromStage utility for safe checkpoint manipulation.
 *
 * @param creationTxHash - The creation transaction hash
 * @param stageIndex - Index to trim from (inclusive)
 */
export async function trimCachedStages(
  creationTxHash: string,
  stageIndex: number
): Promise<boolean> {
  const cache = getCacheAdapter();
  const key = txHashCacheKey(creationTxHash);
  const checkpoint = await cache.get<TrackingCheckpoint>(key);

  if (!checkpoint?.cachedData?.completedStages) {
    return false;
  }

  const stages = checkpoint.cachedData.completedStages;
  if (stageIndex >= stages.length) {
    return false;
  }

  // Use gov-tracker's trimFromStage utility
  const trimmedCheckpoint = trimFromStage(checkpoint, stageIndex);

  await cache.set(key, trimmedCheckpoint);
  debug.cache(
    "trimmed checkpoint for %s from index %d (%d → %d stages)",
    creationTxHash.slice(0, 10),
    stageIndex,
    stages.length,
    trimmedCheckpoint.cachedData?.completedStages?.length ?? 0
  );

  return true;
}
