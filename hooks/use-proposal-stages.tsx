"use client";

import { getGovernorByAddress } from "@/config/governors";
import { initializeBundledCache } from "@/lib/bundled-cache-loader";
import { getErrorMessage } from "@/lib/error-utils";
import { getCacheAdapter, trimCachedStages } from "@/lib/gov-tracker-cache";
import {
  emitVoteUpdate,
  trackerManager,
  type TrackingSession,
} from "@/lib/proposal-tracker-manager";
import {
  createProposalTracker,
  getAllStageMetadata,
  toProposalTrackingResult,
} from "@/lib/stage-tracker";
import type {
  ProposalStage,
  ProposalTrackingResult,
} from "@/types/proposal-stage";
import {
  getVotingDataFromStages,
  type StageType,
  type TrackedStage,
  type TrackingProgress,
} from "@gzeoneth/gov-tracker";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRpcSettings } from "./use-rpc-settings";

interface UseProposalStagesOptions {
  proposalId: string;
  creationTxHash: string;
  governorAddress: string;
  enabled?: boolean;
  l1RpcUrl?: string;
  l2RpcUrl?: string;
  currentL1Block?: number | null;
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
  currentL1Block = null,
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
    async (startFromStage?: number) => {
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
          _isComplete: boolean
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

        // Initialize cache with gov-tracker's bundled cache on first run
        // This eliminates the need for initial RPC discovery calls
        await initializeBundledCache(cache);

        // Create tracker using gov-tracker package with cache for resume
        // Gov-tracker handles checkpoint loading/saving automatically
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

        // Add proposal metadata for UI display
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

        // Gov-tracker automatically saves checkpoint to cache, no manual save needed

        // Emit vote update using gov-tracker's utility
        const voteData = getVotingDataFromStages(proposalResult.stages);
        if (voteData?.forVotesRaw) {
          emitVoteUpdate({
            proposalId,
            governorAddress,
            forVotes: voteData.forVotesRaw,
            againstVotes: voteData.againstVotesRaw ?? "0",
            abstainVotes: voteData.abstainVotesRaw ?? "0",
          });
        }
      } catch (err) {
        if (abortController.signal.aborted) {
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
    async (stageIndex: number) => {
      if (!proposalId || !governorAddress) return;

      // Trim gov-tracker checkpoint from the specified stage index
      // This removes all stages including and after stageIndex
      await trimCachedStages(creationTxHash, stageIndex);

      // Abort any existing tracking
      trackerManager.abortTracking(proposalId, governorAddress);

      // Reset session and start fresh tracking
      // The tracker will load trimmed checkpoint and continue from there
      trackerManager.updateSession(proposalId, governorAddress, {
        stages: [],
        currentStageIndex: -1,
        status: "idle",
        result: null,
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

  // Mount/unmount tracking
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

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

    // Start tracking if not already tracking
    // The tracker loads from LocalStorageCache automatically (including linked timelock checkpoints)
    if (
      session.status !== "loading" &&
      session.status !== "queued" &&
      session.status !== "complete"
    ) {
      trackerManager.requestTracking(proposalId, governorAddress, () =>
        startTracking()
      );
    }

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
  ]);

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
export function getAllStageTypes(): StageMetadataWithType[] {
  const metadata = getAllStageMetadata();
  return (
    Object.entries(metadata) as [StageType, (typeof metadata)[StageType]][]
  ).map(([type, meta]) => ({
    type,
    ...meta,
  }));
}
