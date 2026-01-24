"use client";

/**
 * Hook for discovering timelock operations that are not part of proposals
 *
 * These "orphan" timelock operations include:
 * - Security Council operations
 * - Direct timelock executions not from governor proposals
 */

import { DEFAULT_FORM_VALUES } from "@/config/arbitrum-governance";
import { BLOCKS_PER_DAY } from "@/config/block-times";
import { STORAGE_KEYS } from "@/config/storage-keys";
import {
  extractOperationIdsFromBundledCache,
  extractTimelockOpsFromBundledCache,
} from "@/lib/bundled-cache-loader";
import { getErrorMessage } from "@/lib/error-utils";
import { getCacheAdapter } from "@/lib/gov-tracker-cache";
import { createProposalTracker } from "@/lib/stage-tracker";
import {
  ADDRESSES,
  type DiscoveredTimelockOp,
  type LifecyclePhase,
  type TrackingCheckpoint,
  extractOperationId,
  getLifecyclePhase,
  isChildCheckpoint,
} from "@gzeoneth/gov-tracker";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocalStorage } from "./use-local-storage";
import { useRpcSettings } from "./use-rpc-settings";

/** Lifecycle status for display (mapped from gov-tracker's LifecyclePhase) */
export type LifecycleStatus =
  | "Created"
  | "Voting"
  | "Queued"
  | "L2 Pending"
  | "L2 Executed"
  | "L2→L1"
  | "L1 Pending"
  | "L1 Executed"
  | "Finalizing"
  | "Completed"
  | "Failed"
  | "Unknown";

/** Discovered timelock operation with orphan status */
export interface TimelockOpWithStatus extends DiscoveredTimelockOp {
  isOrphan: boolean;
  timelockName: string;
  lifecycleStatus: LifecycleStatus;
}

const PHASE_TO_STATUS: Record<LifecyclePhase, LifecycleStatus> = {
  voting: "Voting",
  queued: "Queued",
  l2_delay: "L2 Pending",
  bridging: "L2→L1",
  l1_delay: "L1 Pending",
  finalizing: "Finalizing",
  executed: "Completed",
  failed: "Failed",
  unknown: "Unknown",
};

/** Options for timelock discovery */
interface UseTimelockOpsDiscoveryOptions {
  enabled?: boolean;
  daysToSearch?: number;
}

/** Return type for the hook */
interface UseTimelockOpsDiscoveryResult {
  operations: TimelockOpWithStatus[];
  isLoading: boolean;
  error: string | null;
  progress: number;
  refetch: () => void;
}

function getTimelockName(address: string): string {
  const addr = address.toLowerCase();
  if (addr === ADDRESSES.L2_CONSTITUTIONAL_TIMELOCK.toLowerCase()) {
    return "Core Timelock";
  }
  if (addr === ADDRESSES.L2_NON_CONSTITUTIONAL_TIMELOCK.toLowerCase()) {
    return "Treasury Timelock";
  }
  return "Unknown Timelock";
}

async function getGovernorOperationIds(
  cache: Awaited<ReturnType<typeof getCacheAdapter>>
): Promise<Set<string>> {
  const operationIds = new Set<string>();

  const bundledOpIds = await extractOperationIdsFromBundledCache();
  for (const opId of bundledOpIds) {
    operationIds.add(opId);
  }

  const keys = await cache.keys("tx:");
  for (const key of keys) {
    const checkpoint = await cache.get<TrackingCheckpoint>(key);
    if (!checkpoint || checkpoint.input?.type !== "governor") continue;

    const opId = extractOperationId(
      checkpoint.cachedData?.completedStages ?? []
    );
    if (opId) {
      operationIds.add(opId.toLowerCase());
    }
  }

  return operationIds;
}

async function isOrphanTimelockOp(
  key: string,
  operationId: string,
  checkpoint: TrackingCheckpoint | null,
  governorOperationIds: Set<string>,
  cache: Awaited<ReturnType<typeof getCacheAdapter>>
): Promise<boolean> {
  if (await isChildCheckpoint(key, cache)) return false;
  if (checkpoint?.input?.type === "governor") return false;
  if (governorOperationIds.has(operationId.toLowerCase())) return false;

  return true;
}

/**
 * Hook for discovering orphan timelock operations
 */
export function useTimelockOpsDiscovery({
  enabled = true,
  daysToSearch,
}: UseTimelockOpsDiscoveryOptions = {}): UseTimelockOpsDiscoveryResult {
  const { l2Rpc, l2ChunkSize, isHydrated: rpcHydrated } = useRpcSettings();

  const [storedDays] = useLocalStorage<number>(
    STORAGE_KEYS.DAYS_TO_SEARCH,
    DEFAULT_FORM_VALUES.daysToSearch
  );

  const effectiveDays = daysToSearch ?? storedDays;

  const [operations, setOperations] = useState<TimelockOpWithStatus[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  const isMounted = useRef(true);
  const abortControllerRef = useRef<AbortController | null>(null);

  const discover = useCallback(async () => {
    if (!enabled || !rpcHydrated) return;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsLoading(true);
    setError(null);
    setOperations([]);
    setProgress(0);

    try {
      const cache = getCacheAdapter();

      // Create tracker instance to use discovery methods
      const tracker = createProposalTracker(l2Rpc, undefined, {
        chunkingConfig: { l2ChunkSize },
        cache,
      });

      const l2Provider = tracker.getProviders().l2;
      const currentBlock = await l2Provider.getBlockNumber();
      const blocksToSearch = effectiveDays * BLOCKS_PER_DAY.arbitrum;
      const fromBlock = Math.max(0, currentBlock - blocksToSearch);

      if (controller.signal.aborted) return;
      setProgress(10);

      // Discover from both L2 timelocks in parallel using tracker methods
      const [coreOps, treasuryOps] = await Promise.all([
        tracker.discoverTimelockOps(
          ADDRESSES.L2_CONSTITUTIONAL_TIMELOCK,
          fromBlock,
          currentBlock
        ),
        tracker.discoverTimelockOps(
          ADDRESSES.L2_NON_CONSTITUTIONAL_TIMELOCK,
          fromBlock,
          currentBlock
        ),
      ]);

      if (controller.signal.aborted) return;
      setProgress(60);

      const bundledOps = await extractTimelockOpsFromBundledCache();

      if (controller.signal.aborted) return;
      setProgress(65);

      // Build a map of bundled ops with their stages for lifecycle status
      const bundledStagesMap = new Map(
        bundledOps.map((op) => [op.operationId.toLowerCase(), op.stages])
      );

      // Merge: bundled first, then live (live wins on conflict)
      const liveOps = [...coreOps, ...treasuryOps];
      const merged = new Map(
        bundledOps.map((op) => [
          op.operationId.toLowerCase(),
          op as DiscoveredTimelockOp,
        ])
      );
      for (const op of liveOps) {
        merged.set(op.operationId.toLowerCase(), op);
      }

      const allOps = Array.from(merged.values());
      const governorOpIds = await getGovernorOperationIds(cache);

      const opsWithStatus: TimelockOpWithStatus[] = [];
      const totalOps = allOps.length;

      for (let i = 0; i < allOps.length; i++) {
        if (controller.signal.aborted) return;

        const op = allOps[i];
        const opIdLower = op.operationId.toLowerCase();
        const cacheKey = `tx:${op.scheduledTxHash.toLowerCase()}`;
        const checkpoint = await cache.get<TrackingCheckpoint>(cacheKey);

        const isOrphan = await isOrphanTimelockOp(
          cacheKey,
          op.operationId,
          checkpoint,
          governorOpIds,
          cache
        );

        // Use bundled stages if available, otherwise track via RPC
        let lifecycleStatus: LifecycleStatus = "Unknown";
        const bundledStages = bundledStagesMap.get(opIdLower);
        if (bundledStages && bundledStages.length > 0) {
          lifecycleStatus = PHASE_TO_STATUS[getLifecyclePhase(bundledStages)];
        } else {
          try {
            const results = await tracker.trackByTxHash(
              op.scheduledTxHash,
              op.operationId
            );
            if (results.length > 0) {
              lifecycleStatus =
                PHASE_TO_STATUS[getLifecyclePhase(results[0].stages)];
            }
          } catch {
            // If tracking fails, status remains "Unknown"
          }
        }

        opsWithStatus.push({
          ...op,
          isOrphan,
          timelockName: getTimelockName(op.timelockAddress),
          lifecycleStatus,
        });

        setProgress(70 + Math.floor((i / totalOps) * 25));
      }

      if (controller.signal.aborted) return;

      // Sort by block number descending (most recent first)
      opsWithStatus.sort((a, b) => b.queueBlock - a.queueBlock);

      if (!isMounted.current) return;

      setOperations(opsWithStatus);
      setProgress(100);
      setIsLoading(false);
    } catch (err) {
      if (controller.signal.aborted) return;
      if (!isMounted.current) return;

      setError(getErrorMessage(err, "discover timelock operations"));
      setIsLoading(false);
    }
  }, [enabled, rpcHydrated, l2Rpc, l2ChunkSize, effectiveDays]);

  const refetch = useCallback(() => {
    discover();
  }, [discover]);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      abortControllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (enabled && rpcHydrated) {
      discover();
    }
  }, [enabled, rpcHydrated, discover]);

  return {
    operations,
    isLoading,
    error,
    progress,
    refetch,
  };
}
