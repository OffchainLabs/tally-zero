"use client";

import { getGovernorByAddress } from "@/config/governors";
import {
  CACHE_TTL_CHECK_INTERVAL_MS,
  L1_BLOCK_CACHE_FRESHNESS_MS,
  L1_BLOCK_REFRESH_INTERVAL_MS,
} from "@/config/storage-keys";
import { getErrorMessage } from "@/lib/error-utils";
import {
  clearProposalCheckpoint,
  getCacheAdapter,
  seedCheckpointFromStages,
} from "@/lib/gov-tracker-cache";
import {
  emitVoteUpdate,
  trackerManager,
  type TrackingSession,
} from "@/lib/proposal-tracker-manager";
import {
  createProposalTracker,
  toProposalTrackingResult,
} from "@/lib/stage-tracker";
import { clearCachedStages, saveCachedStages } from "@/lib/stages-cache";
import { getStoredCacheTtlMs } from "@/lib/storage-utils";
import {
  clearCachedTimelockResult,
  loadUnifiedStages,
  needsRefresh,
  trimUnifiedCacheFromIndex,
} from "@/lib/unified-cache";
import type {
  ProposalStage,
  ProposalTrackingResult,
} from "@/types/proposal-stage";
import {
  getAllStageMetadata,
  type StageType,
  type TrackedStage,
  type TrackingProgress,
} from "@gzeoneth/gov-tracker";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRpcSettings } from "./use-rpc-settings";

// Shared L1 block cache to avoid redundant RPC calls across hook instances
let sharedL1Block: { block: number; timestamp: number } | null = null;
let pendingL1BlockPromise: Promise<number | null> | null = null;

/**
 * Fetch L1 block with deduplication - multiple callers share the same result
 * within a short time window
 */
async function fetchSharedL1Block(rpcUrl: string): Promise<number | null> {
  // Return cached value if fresh
  if (
    sharedL1Block &&
    Date.now() - sharedL1Block.timestamp < L1_BLOCK_CACHE_FRESHNESS_MS
  ) {
    return sharedL1Block.block;
  }

  // If a fetch is already in progress, wait for it
  if (pendingL1BlockPromise) {
    return pendingL1BlockPromise;
  }

  // Start a new fetch
  pendingL1BlockPromise = (async () => {
    try {
      const response = await fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "eth_blockNumber",
          params: [],
          id: 1,
        }),
      });
      const data = await response.json();
      if (data.result) {
        const block = parseInt(data.result, 16);
        sharedL1Block = { block, timestamp: Date.now() };
        return block;
      }
      return null;
    } catch {
      return null;
    } finally {
      pendingL1BlockPromise = null;
    }
  })();

  return pendingL1BlockPromise;
}

interface UseProposalStagesOptions {
  proposalId: string;
  creationTxHash: string;
  governorAddress: string;
  enabled?: boolean;
  l1RpcUrl?: string;
  l2RpcUrl?: string;
}

interface UseProposalStagesResult {
  stages: ProposalStage[];
  currentStageIndex: number;
  isLoading: boolean;
  isQueued: boolean;
  queuePosition: number | null;
  isComplete: boolean;
  error: string | null;
  result: ProposalTrackingResult | null;
  refetchFromStage: (stageIndex: number) => void;
  refreshingFromIndex: number | null;
  currentL1Block: number | null;
  isBackgroundRefreshing: boolean;
}

export function useProposalStages({
  proposalId,
  creationTxHash,
  governorAddress,
  enabled = true,
  l1RpcUrl,
  l2RpcUrl,
}: UseProposalStagesOptions): UseProposalStagesResult {
  const {
    l1Rpc,
    l2Rpc,
    l1ChunkSize,
    l2ChunkSize,
    isHydrated: rpcHydrated,
  } = useRpcSettings();

  const effectiveL1RpcUrl = l1RpcUrl || l1Rpc;
  const effectiveL2RpcUrl = l2RpcUrl || l2Rpc;

  // Local state that syncs with the global session
  const [stages, setStages] = useState<ProposalStage[]>([]);
  const [currentStageIndex, setCurrentStageIndex] = useState(-1);
  const [isLoading, setIsLoading] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ProposalTrackingResult | null>(null);
  const [refreshingFromIndex, setRefreshingFromIndex] = useState<number | null>(
    null
  );
  const [isQueued, setIsQueued] = useState(false);
  const [queuePosition, setQueuePosition] = useState<number | null>(null);
  const [currentL1Block, setCurrentL1Block] = useState<number | null>(null);
  const [isBackgroundRefreshing, setIsBackgroundRefreshing] = useState(false);

  const isMounted = useRef(true);

  // Sync local state from session
  const syncFromSession = useCallback((session: TrackingSession) => {
    if (!isMounted.current) return;
    setStages(session.stages);
    setCurrentStageIndex(session.currentStageIndex);
    setIsLoading(session.status === "loading");
    setIsQueued(session.status === "queued");
    setQueuePosition(session.queuePosition);
    setIsComplete(session.status === "complete");
    setError(session.error);
    setResult(session.result);
    setRefreshingFromIndex(session.refreshingFromIndex);
    setIsBackgroundRefreshing(session.isBackgroundRefreshing);
  }, []);

  // Start tracking function using gov-tracker
  const startTracking = useCallback(
    async (startFromStage?: number, existingStages?: ProposalStage[]) => {
      if (!proposalId || !creationTxHash || !governorAddress) return;

      const abortController = new AbortController();

      trackerManager.updateSession(proposalId, governorAddress, {
        status: "loading",
        error: null,
        abortController,
        refreshingFromIndex: startFromStage ?? null,
      });

      try {
        const governorConfig = getGovernorByAddress(governorAddress);
        if (!governorConfig) {
          throw new Error(`Unknown governor address: ${governorAddress}`);
        }

        // Create tracker with progress callback
        const onProgress = (
          stage: TrackedStage,
          index: number,
          isComplete: boolean
        ) => {
          if (abortController.signal.aborted) return;

          const session = trackerManager.getSession(
            proposalId,
            governorAddress
          );
          if (!session) return;

          const newStages = [...session.stages];
          newStages[index] = stage;

          trackerManager.updateSession(proposalId, governorAddress, {
            stages: newStages,
            currentStageIndex: index,
          });
        };

        // Get cache adapter for zero-RPC resume
        const cache = getCacheAdapter();

        // Seed checkpoint from existing cached stages before tracking
        // This enables gov-tracker to resume from where we left off
        const cacheTtlMs = getStoredCacheTtlMs();
        const unifiedResult = loadUnifiedStages(
          proposalId,
          governorAddress,
          cacheTtlMs
        );
        if (unifiedResult.stages.length > 0) {
          await seedCheckpointFromStages(
            cache,
            proposalId,
            governorAddress,
            creationTxHash,
            unifiedResult.stages
          );
        }

        // Create tracker using gov-tracker package with cache for resume
        const tracker = createProposalTracker(
          effectiveL2RpcUrl || undefined,
          effectiveL1RpcUrl || undefined,
          {
            onProgress: (progress: TrackingProgress) => {
              onProgress(
                progress.stage,
                progress.currentIndex,
                progress.isComplete
              );
            },
            chunkingConfig: {
              l1ChunkSize,
              l2ChunkSize,
            },
            cache,
          }
        );

        // Track by transaction hash
        const results = await tracker.trackByTxHash(creationTxHash);

        if (abortController.signal.aborted) {
          // Clear background refresh flag on abort
          trackerManager.updateSession(proposalId, governorAddress, {
            isBackgroundRefreshing: false,
          });
          return;
        }

        // Use first result (governor proposals return single result)
        const trackingResult = results[0];
        if (!trackingResult) {
          throw new Error("No tracking result returned");
        }

        // Convert to ProposalTrackingResult for backwards compatibility
        const proposalResult = toProposalTrackingResult(
          trackingResult,
          proposalId,
          creationTxHash,
          governorAddress
        );

        trackerManager.trackingFinished(proposalId, governorAddress);

        trackerManager.updateSession(proposalId, governorAddress, {
          result: proposalResult,
          stages: proposalResult.stages,
          status: "complete",
          refreshingFromIndex: null,
          abortController: null,
          isBackgroundRefreshing: false,
        });

        saveCachedStages(proposalId, governorAddress, proposalResult);

        // Emit vote update using raw values from gov-tracker
        const votingStage = proposalResult.stages.find(
          (s) => s.type === "VOTING_ACTIVE"
        );
        const forVotesRaw = votingStage?.data?.forVotesRaw as
          | string
          | undefined;
        if (forVotesRaw) {
          emitVoteUpdate({
            proposalId,
            governorAddress,
            forVotes: forVotesRaw,
            againstVotes: (votingStage?.data?.againstVotesRaw as string) || "0",
            abstainVotes: (votingStage?.data?.abstainVotesRaw as string) || "0",
          });
        }
      } catch (err) {
        if (abortController.signal.aborted) {
          // Clear background refresh flag on abort
          trackerManager.updateSession(proposalId, governorAddress, {
            isBackgroundRefreshing: false,
          });
          return;
        }
        trackerManager.trackingFinished(proposalId, governorAddress);

        trackerManager.updateSession(proposalId, governorAddress, {
          error: getErrorMessage(err, "track proposal stages"),
          status: "error",
          refreshingFromIndex: null,
          abortController: null,
          isBackgroundRefreshing: false,
        });
      }
    },
    [
      proposalId,
      creationTxHash,
      governorAddress,
      effectiveL1RpcUrl,
      effectiveL2RpcUrl,
      l1ChunkSize,
      l2ChunkSize,
    ]
  );

  // Refetch from a specific stage
  const refetchFromStage = useCallback(
    (stageIndex: number) => {
      if (!proposalId || !governorAddress) return;

      // Trim cache from the specified stage index
      // This removes all stages including and after stageIndex
      const trimmed = trimUnifiedCacheFromIndex(
        proposalId,
        governorAddress,
        stageIndex
      );

      // If nothing was trimmed (no cache), clear everything as fallback
      if (!trimmed) {
        clearCachedStages(proposalId, governorAddress);
        const session = trackerManager.getSession(proposalId, governorAddress);
        const existingResult = session?.result;
        if (existingResult?.timelockLink) {
          clearCachedTimelockResult(
            existingResult.timelockLink.txHash,
            existingResult.timelockLink.operationId
          );
        }
      }

      // Clear gov-tracker checkpoint so it re-tracks with fresh cache
      const cache = getCacheAdapter();
      clearProposalCheckpoint(cache, creationTxHash);

      // Abort any existing tracking
      trackerManager.abortTracking(proposalId, governorAddress);

      // Load the trimmed cache to get the updated stages
      const cacheTtlMs = getStoredCacheTtlMs();
      const unifiedResult = loadUnifiedStages(
        proposalId,
        governorAddress,
        cacheTtlMs
      );

      // Update session with trimmed stages (keep what we have)
      trackerManager.updateSession(proposalId, governorAddress, {
        stages: unifiedResult.stages,
        currentStageIndex:
          unifiedResult.stages.length > 0
            ? unifiedResult.stages.length - 1
            : -1,
        status: "idle",
        result: unifiedResult.proposalResult,
        error: null,
        queuePosition: null,
      });

      // Start tracking to re-discover the removed stages
      trackerManager.requestTracking(proposalId, governorAddress, () =>
        startTracking()
      );
    },
    [proposalId, governorAddress, creationTxHash, startTracking]
  );

  // Mount/unmount effect
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  // Fetch current L1 block for timing calculations (uses shared cache)
  useEffect(() => {
    if (!enabled || !rpcHydrated) return;

    const updateL1Block = async () => {
      const block = await fetchSharedL1Block(effectiveL1RpcUrl);
      if (block !== null && isMounted.current) {
        setCurrentL1Block(block);
      }
    };

    // Fetch immediately (may use cached value)
    updateL1Block();

    // Refresh periodically
    const interval = setInterval(updateL1Block, L1_BLOCK_REFRESH_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [enabled, rpcHydrated, effectiveL1RpcUrl]);

  // Function to trigger background refresh
  // Background refresh keeps cached stages visible while updating
  const triggerBackgroundRefresh = useCallback(() => {
    if (!proposalId || !governorAddress) return;

    const session = trackerManager.getSession(proposalId, governorAddress);
    if (!session) return;

    if (
      session.isBackgroundRefreshing ||
      session.status === "loading" ||
      session.status === "queued"
    ) {
      return;
    }

    // Mark as background refreshing without changing status
    // This keeps cached stages visible during refresh
    trackerManager.updateSession(proposalId, governorAddress, {
      isBackgroundRefreshing: true,
    });

    trackerManager.requestTracking(proposalId, governorAddress, () =>
      startTracking()
    );
  }, [proposalId, governorAddress, startTracking]);

  // Subscribe to session and start tracking if needed
  useEffect(() => {
    if (
      !enabled ||
      !proposalId ||
      !creationTxHash ||
      !governorAddress ||
      !rpcHydrated
    ) {
      return;
    }

    // Create or get session
    const session = trackerManager.createSession(proposalId, governorAddress);

    // Subscribe to updates
    const unsubscribe = trackerManager.subscribe(
      proposalId,
      governorAddress,
      syncFromSession
    );

    // Check if we need to start tracking
    const checkAndStartTracking = () => {
      // Already tracking or queued
      if (session.status === "loading" || session.status === "queued") {
        return;
      }

      // Check for cached result using unified cache
      const cacheTtlMs = getStoredCacheTtlMs();
      const unifiedResult = loadUnifiedStages(
        proposalId,
        governorAddress,
        cacheTtlMs
      );

      if (unifiedResult.stages.length > 0) {
        // Construct a ProposalTrackingResult from unified cache
        const cachedResult: ProposalTrackingResult = {
          proposalId,
          creationTxHash,
          governorAddress,
          stages: unifiedResult.stages,
          timelockLink: unifiedResult.timelockLink,
          currentState: unifiedResult.proposalResult?.currentState,
        };

        // Always load the cached data first
        trackerManager.updateSession(proposalId, governorAddress, {
          stages: unifiedResult.stages,
          currentStageIndex: unifiedResult.stages.length - 1,
          result: cachedResult,
          status: "complete",
        });

        // If any cache is expired and not all stages are completed, do a background refresh
        if (needsRefresh(unifiedResult)) {
          triggerBackgroundRefresh();
        }
        return;
      }

      // No cache, start fresh tracking
      if (session.status !== "complete") {
        trackerManager.requestTracking(proposalId, governorAddress, () =>
          startTracking()
        );
      }
    };

    checkAndStartTracking();

    return () => {
      unsubscribe();
    };
  }, [
    proposalId,
    creationTxHash,
    governorAddress,
    enabled,
    rpcHydrated,
    syncFromSession,
    startTracking,
    triggerBackgroundRefresh,
  ]);

  // Periodic TTL check - continuously check for expiration while user is on page
  useEffect(() => {
    if (!enabled || !proposalId || !governorAddress) return;

    const checkTtlExpiration = () => {
      const session = trackerManager.getSession(proposalId, governorAddress);
      if (!session || session.status !== "complete") return;
      if (session.isBackgroundRefreshing) return;

      const cacheTtlMs = getStoredCacheTtlMs();
      const unifiedResult = loadUnifiedStages(
        proposalId,
        governorAddress,
        cacheTtlMs
      );

      // Check if any cache needs refresh
      if (needsRefresh(unifiedResult)) {
        triggerBackgroundRefresh();
      }
    };

    // Check periodically for expired cache
    const interval = setInterval(
      checkTtlExpiration,
      CACHE_TTL_CHECK_INTERVAL_MS
    );

    return () => clearInterval(interval);
  }, [enabled, proposalId, governorAddress, triggerBackgroundRefresh]);

  return {
    stages,
    currentStageIndex,
    isLoading,
    isQueued,
    queuePosition,
    isComplete,
    error,
    result,
    refetchFromStage,
    refreshingFromIndex,
    currentL1Block,
    isBackgroundRefreshing,
  };
}

/** Stage metadata with type included for array iteration */
export interface StageMetadataWithType {
  type: StageType;
  title: string;
  description: string;
  chain: "ethereum" | "arb1" | "nova" | "unknown" | "CROSS_CHAIN";
  estimatedDays: number;
  requiresAction: boolean;
}

/**
 * Get all stage metadata as an array with type included
 * gov-tracker's getAllStageMetadata() returns a Record<StageType, StageMetadata>
 * This function converts it to an array with the type key included
 */
export function getAllStageTypes(
  governorType: "core" | "treasury" = "core"
): StageMetadataWithType[] {
  const metadata = getAllStageMetadata();
  return (
    Object.entries(metadata) as [StageType, (typeof metadata)[StageType]][]
  ).map(([type, meta]) => ({
    type,
    ...meta,
  }));
}
