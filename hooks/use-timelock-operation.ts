"use client";

/**
 * Hook for tracking timelock operations across L1/L2
 * Uses @gzeoneth/gov-tracker for tracking lifecycle stages
 */

import { isValidTxHash } from "@/lib/address-utils";
import { initializeBundledCache } from "@/lib/bundled-cache-loader";
import { getErrorMessage } from "@/lib/error-utils";
import { getCacheAdapter } from "@/lib/gov-tracker-cache";
import { getOrCreateProvider } from "@/lib/rpc-utils";
import { createProposalTracker } from "@/lib/stage-tracker";
import type { ProposalStage } from "@/types/proposal-stage";
import {
  findCallScheduledByTxHash,
  isCheckpointComplete,
  txHashCacheKey,
  type CallScheduledData,
  type TrackingCheckpoint,
  type TrackingProgress,
} from "@gzeoneth/gov-tracker";
import { ethers } from "ethers";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRpcSettings } from "./use-rpc-settings";

/** Info about a discovered timelock operation */
export interface TimelockOperationInfo {
  operationId: string;
  target: string;
  value: string;
  data: string;
  predecessor: string;
  delay: string;
  txHash: string;
  blockNumber: number;
  timestamp: number;
  timelockAddress: string;
}

/** Result from tracking a timelock operation */
export interface TimelockTrackingResult {
  operationInfo: TimelockOperationInfo;
  stages: ProposalStage[];
  error?: string;
}

interface CachedTimelockOperation {
  operation: TimelockOperationInfo;
  stages: ProposalStage[];
  isComplete: boolean;
}

/** Options for configuring timelock operation tracking */
interface UseTimelockOperationOptions {
  /** Transaction hash containing CallScheduled events */
  txHash: string;
  /** Whether tracking is enabled */
  enabled?: boolean;
  /** Custom L1 (Ethereum) RPC URL */
  l1RpcUrl?: string;
  /** Custom L2 (Arbitrum) RPC URL */
  l2RpcUrl?: string;
}

/** Return type for useTimelockOperation hook */
interface UseTimelockOperationResult {
  /** List of timelock operations found in transaction */
  operations: TimelockOperationInfo[];
  /** Currently selected operation for tracking */
  selectedOperation: TimelockOperationInfo | null;
  /** Lifecycle stages for the selected operation */
  stages: ProposalStage[];
  /** Whether any operation is loading */
  isLoading: boolean;
  /** Whether transaction is being parsed */
  isParsing: boolean;
  /** Whether operation is being tracked */
  isTracking: boolean;
  /** Error message if any operation failed */
  error: string | null;
  /** Full tracking result for selected operation */
  result: TimelockTrackingResult | null;
  /** Function to select an operation for tracking */
  selectOperation: (operation: TimelockOperationInfo) => void;
  /** Function to deselect and go back to list */
  deselectOperation: () => void;
  /** Function to force refresh tracking */
  refetch: () => void;
}

function stringifyBigNumberish(
  value: string | number | bigint | { toString(): string } | null | undefined,
  fallback: string
): string {
  if (value === null || value === undefined) return fallback;
  return value.toString();
}

function getCachedOperationIdKey(operationId: string): string {
  return operationId.toLowerCase();
}

function getScheduledDataFromStage(
  stage: ProposalStage | undefined,
  operationId: string
): Partial<CallScheduledData> | undefined {
  const stageData = stage?.data as { callScheduledData?: unknown } | undefined;
  const scheduledData = stageData?.callScheduledData;
  if (!Array.isArray(scheduledData)) return undefined;

  return scheduledData.find((entry) => {
    if (!entry || typeof entry !== "object") return false;
    const maybeOperationId = (entry as Partial<CallScheduledData>).operationId;
    return (
      typeof maybeOperationId === "string" &&
      maybeOperationId.toLowerCase() === operationId.toLowerCase()
    );
  }) as Partial<CallScheduledData> | undefined;
}

function buildOperationFromCheckpoint(
  checkpoint: TrackingCheckpoint,
  requestedTxHash: string
): CachedTimelockOperation | null {
  if (checkpoint.input.type !== "timelock") return null;

  const stages = checkpoint.cachedData?.completedStages ?? [];
  const l2TimelockStage = stages.find((stage) => stage.type === "L2_TIMELOCK");
  if (!l2TimelockStage && !checkpoint.input.timelockAddress) return null;

  const scheduledData = getScheduledDataFromStage(
    l2TimelockStage,
    checkpoint.input.operationId
  );

  const scheduledTx =
    l2TimelockStage?.transactions?.find(
      (tx) => tx.description === "queued" || tx.description === "scheduled"
    ) ?? l2TimelockStage?.transactions?.[0];

  const scheduledTxHash =
    scheduledData?.txHash ??
    checkpoint.input.scheduledTxHash ??
    requestedTxHash;
  const blockNumber =
    scheduledData?.blockNumber ?? scheduledTx?.blockNumber ?? 0;

  return {
    operation: {
      operationId: checkpoint.input.operationId,
      target: scheduledData?.target ?? "",
      value: stringifyBigNumberish(scheduledData?.value, "0"),
      data: scheduledData?.data ?? "0x",
      predecessor: scheduledData?.predecessor ?? ethers.constants.HashZero,
      delay: stringifyBigNumberish(scheduledData?.delay, "0"),
      txHash: scheduledTxHash,
      blockNumber,
      timestamp: scheduledTx?.timestamp ?? 0,
      timelockAddress:
        scheduledData?.timelockAddress ?? checkpoint.input.timelockAddress,
    },
    stages,
    isComplete: isCheckpointComplete(checkpoint),
  };
}

async function loadCachedTimelockOperationsForTx(
  txHash: string
): Promise<CachedTimelockOperation[]> {
  const cache = getCacheAdapter();
  await initializeBundledCache(cache);

  const baseKey = txHashCacheKey(txHash);
  const operationKeys = Array.from(await cache.keys(`${baseKey}:op:`));

  const cachedOperations = await Promise.all(
    operationKeys.map(async (key) => {
      const checkpoint = await cache.get<TrackingCheckpoint>(key);
      return checkpoint
        ? buildOperationFromCheckpoint(checkpoint, txHash)
        : null;
    })
  );

  const operationsById = new Map<string, CachedTimelockOperation>();
  for (const cached of cachedOperations) {
    if (!cached) continue;
    operationsById.set(
      getCachedOperationIdKey(cached.operation.operationId),
      cached
    );
  }

  const baseCheckpoint = await cache.get<TrackingCheckpoint>(baseKey);
  const linkedTimelockKey = baseCheckpoint?.metadata?.timelockOpKey;
  if (
    linkedTimelockKey &&
    linkedTimelockKey.startsWith(`${baseKey}:op:`) &&
    !operationsById.has(linkedTimelockKey.slice(`${baseKey}:op:`.length))
  ) {
    const linkedCheckpoint =
      await cache.get<TrackingCheckpoint>(linkedTimelockKey);
    const cached = linkedCheckpoint
      ? buildOperationFromCheckpoint(linkedCheckpoint, txHash)
      : null;
    if (cached) {
      operationsById.set(
        getCachedOperationIdKey(cached.operation.operationId),
        cached
      );
    }
  }

  return Array.from(operationsById.values());
}

/**
 * Hook for tracking timelock operations from a transaction
 * Uses gov-tracker package for lifecycle tracking
 *
 * @param options - Tracking options including txHash and RPC URLs
 * @returns Operations, stages, loading state, and control functions
 */
export function useTimelockOperation({
  txHash,
  enabled = true,
  l1RpcUrl,
  l2RpcUrl,
}: UseTimelockOperationOptions): UseTimelockOperationResult {
  const {
    l1Rpc,
    l2Rpc,
    l1ChunkSize,
    l2ChunkSize,
    isHydrated: rpcHydrated,
  } = useRpcSettings();

  const effectiveL1RpcUrl = l1RpcUrl || l1Rpc;
  const effectiveL2RpcUrl = l2RpcUrl || l2Rpc;

  const [operations, setOperations] = useState<TimelockOperationInfo[]>([]);
  const [selectedOperation, setSelectedOperation] =
    useState<TimelockOperationInfo | null>(null);
  const [stages, setStages] = useState<ProposalStage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [isTracking, setIsTracking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TimelockTrackingResult | null>(null);

  const isMounted = useRef(true);
  const abortControllerRef = useRef<AbortController | null>(null);
  const cachedOperationsRef = useRef<Map<string, CachedTimelockOperation>>(
    new Map()
  );

  const applyCachedOperation = useCallback(
    (operation: TimelockOperationInfo): boolean => {
      const cached = cachedOperationsRef.current.get(
        getCachedOperationIdKey(operation.operationId)
      );
      if (!cached) return false;

      const timelockResult: TimelockTrackingResult = {
        operationInfo: operation,
        stages: cached.stages,
      };

      setStages(cached.stages);
      setResult(timelockResult);
      setError(null);
      return true;
    },
    []
  );

  // Parse transaction to find CallScheduled events using gov-tracker
  const parseTransaction = useCallback(async () => {
    if (!txHash || !enabled || !rpcHydrated) return;

    if (!isValidTxHash(txHash)) {
      setError("Invalid transaction hash format");
      return;
    }

    setIsParsing(true);
    setError(null);
    setOperations([]);
    setSelectedOperation(null);
    setStages([]);
    setResult(null);
    cachedOperationsRef.current = new Map();

    try {
      let cachedOperations: CachedTimelockOperation[] = [];
      try {
        cachedOperations = await loadCachedTimelockOperationsForTx(txHash);
      } catch {
        // Cache is an optimization; live receipt parsing remains the fallback.
      }

      if (!isMounted.current) return;

      if (cachedOperations.length > 0) {
        cachedOperationsRef.current = new Map(
          cachedOperations.map((cached) => [
            getCachedOperationIdKey(cached.operation.operationId),
            cached,
          ])
        );

        const ops = cachedOperations.map((cached) => cached.operation);
        setOperations(ops);

        if (ops.length === 1) {
          setSelectedOperation(ops[0]);
          applyCachedOperation(ops[0]);
        }

        setIsParsing(false);
        return;
      }

      const l2Provider = getOrCreateProvider(effectiveL2RpcUrl);

      // Use gov-tracker's discovery function
      const discoveredOps = await findCallScheduledByTxHash(txHash, l2Provider);

      if (!isMounted.current) return;

      if (!discoveredOps || discoveredOps.length === 0) {
        setError("No CallScheduled events found in this transaction");
        setIsParsing(false);
        return;
      }

      // Get unique block numbers to fetch timestamps
      const blockNumbers = [
        ...new Set(discoveredOps.map((op) => op.blockNumber).filter(Boolean)),
      ];

      // Fetch block timestamps in parallel
      const blockTimestamps = new Map<number, number>();
      await Promise.all(
        blockNumbers.map(async (blockNum) => {
          try {
            const block = await l2Provider.getBlock(blockNum);
            if (block?.timestamp) {
              blockTimestamps.set(blockNum, block.timestamp);
            }
          } catch {
            // Ignore block fetch errors, timestamp will be 0
          }
        })
      );

      if (!isMounted.current) return;

      // Convert to TimelockOperationInfo format with timestamps
      const ops: TimelockOperationInfo[] = discoveredOps.map(
        (op: CallScheduledData) => ({
          operationId: op.operationId,
          target: op.target || "",
          value: op.value?.toString() || "0",
          data: op.data || "0x",
          predecessor: op.predecessor || ethers.constants.HashZero,
          delay: op.delay?.toString() || "0",
          txHash: op.txHash || txHash,
          blockNumber: op.blockNumber || 0,
          timestamp: blockTimestamps.get(op.blockNumber) || 0,
          timelockAddress: op.timelockAddress || "",
        })
      );

      setOperations(ops);

      // Auto-select if there's only one operation
      if (ops.length === 1) {
        setSelectedOperation(ops[0]);
      }

      setIsParsing(false);
    } catch (err) {
      if (!isMounted.current) return;
      setError(getErrorMessage(err, "parse transaction"));
      setIsParsing(false);
    }
  }, [txHash, enabled, rpcHydrated, effectiveL2RpcUrl, applyCachedOperation]);

  // Track selected operation using gov-tracker
  const trackOperation = useCallback(
    async (forceRefresh: boolean = false) => {
      if (!selectedOperation || !enabled || !rpcHydrated) return;

      const cached = cachedOperationsRef.current.get(
        getCachedOperationIdKey(selectedOperation.operationId)
      );
      if (!forceRefresh && cached?.isComplete) {
        applyCachedOperation(selectedOperation);
        setIsLoading(false);
        setIsTracking(false);
        return;
      }

      // Abort any existing tracking
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;
      const signal = controller.signal;

      setIsTracking(true);
      setIsLoading(true);
      setError(null);
      if (!applyCachedOperation(selectedOperation)) {
        setStages([]);
        setResult(null);
      }

      try {
        // Get cache adapter for checkpoint persistence
        const cache = getCacheAdapter();

        // Create tracker using gov-tracker package with cache
        // Gov-tracker handles checkpoint loading/saving automatically
        const tracker = createProposalTracker(
          effectiveL2RpcUrl || undefined,
          effectiveL1RpcUrl || undefined,
          {
            onProgress: (progress: TrackingProgress) => {
              if (signal.aborted) return;
              if (!isMounted.current) return;

              setStages((prev) => {
                const newStages = [...prev];
                newStages[progress.currentIndex] = progress.stage;
                return newStages;
              });
            },
            chunkingConfig: {
              l1ChunkSize,
              l2ChunkSize,
            },
            cache,
          }
        );

        // Track by transaction hash with operationId for multi-operation transactions
        const results = await tracker.trackByTxHash(
          selectedOperation.txHash,
          selectedOperation.operationId
        );

        if (signal.aborted) return;
        if (!isMounted.current) return;

        // With operationId passed, results should contain only the specific operation
        const trackingResult = results[0];

        if (!trackingResult) {
          throw new Error("No tracking result returned");
        }

        // Convert to TimelockTrackingResult
        const timelockResult: TimelockTrackingResult = {
          operationInfo: selectedOperation,
          stages: trackingResult.stages,
        };

        setResult(timelockResult);
        setStages(trackingResult.stages);
        setIsLoading(false);
        setIsTracking(false);
        // Gov-tracker automatically saves checkpoints via the cache adapter
      } catch (err) {
        if (signal.aborted) return;
        if (!isMounted.current) return;

        setError(getErrorMessage(err, "track operation"));
        setIsLoading(false);
        setIsTracking(false);
      }
    },
    [
      selectedOperation,
      enabled,
      rpcHydrated,
      effectiveL1RpcUrl,
      effectiveL2RpcUrl,
      l1ChunkSize,
      l2ChunkSize,
      applyCachedOperation,
    ]
  );

  // Select an operation and start tracking
  const selectOperation = useCallback(
    (operation: TimelockOperationInfo) => {
      // Abort any in-flight tracking before selecting new operation
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      // Reset states before setting new operation to avoid showing stale data
      if (!applyCachedOperation(operation)) {
        setStages([]);
        setResult(null);
      }
      setError(null);
      setSelectedOperation(operation);
    },
    [applyCachedOperation]
  );

  // Deselect the current operation to go back to the list
  const deselectOperation = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setSelectedOperation(null);
    setStages([]);
    setResult(null);
    setError(null);
  }, []);

  // Refetch (force refresh tracking, bypassing cache)
  const refetch = useCallback(() => {
    if (selectedOperation) {
      trackOperation(true);
    } else {
      parseTransaction();
    }
  }, [selectedOperation, trackOperation, parseTransaction]);

  // Mount/unmount effect
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      abortControllerRef.current?.abort();
    };
  }, []);

  // Parse transaction when txHash changes
  useEffect(() => {
    if (txHash && enabled) {
      parseTransaction();
    }
  }, [txHash, enabled, parseTransaction]);

  // Track operation when selection changes
  useEffect(() => {
    if (selectedOperation && enabled) {
      trackOperation();
    }
  }, [selectedOperation, enabled, trackOperation]);

  return {
    operations,
    selectedOperation,
    stages,
    isLoading,
    isParsing,
    isTracking,
    error,
    result,
    selectOperation,
    deselectOperation,
    refetch,
  };
}
