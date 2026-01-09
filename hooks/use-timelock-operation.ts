"use client";

/**
 * Hook for tracking timelock operations across L1/L2
 * Uses @gzeoneth/gov-tracker for tracking lifecycle stages
 */

import { isValidTxHash } from "@/lib/address-utils";
import { getErrorMessage } from "@/lib/error-utils";
import { createProposalTracker } from "@/lib/stage-tracker";
import { getStoredCacheTtlMs } from "@/lib/storage-utils";
import {
  loadCachedTimelockResult,
  saveCachedTimelockResult,
} from "@/lib/unified-cache";
import type { ProposalStage } from "@/types/proposal-stage";
import {
  findCallScheduledByTxHash,
  type CallScheduledData,
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

    try {
      const l2Provider = new ethers.providers.StaticJsonRpcProvider(
        effectiveL2RpcUrl
      );

      // Use gov-tracker's discovery function
      const discoveredOps = await findCallScheduledByTxHash(txHash, l2Provider);

      if (!isMounted.current) return;

      if (!discoveredOps || discoveredOps.length === 0) {
        setError("No CallScheduled events found in this transaction");
        setIsParsing(false);
        return;
      }

      // Convert to TimelockOperationInfo format
      // Note: CallScheduledData doesn't have timestamp, we'll use 0 as placeholder
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
          timestamp: 0, // CallScheduledData doesn't have timestamp
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
  }, [txHash, enabled, rpcHydrated, effectiveL2RpcUrl]);

  // Track selected operation using gov-tracker
  const trackOperation = useCallback(
    async (forceRefresh: boolean = false) => {
      if (!selectedOperation || !enabled || !rpcHydrated) return;

      // Check cache first (unless forcing refresh)
      if (!forceRefresh) {
        const { result: cachedResult, isExpired } = loadCachedTimelockResult(
          selectedOperation.txHash,
          selectedOperation.operationId,
          getStoredCacheTtlMs()
        );

        if (cachedResult && !isExpired) {
          setResult(cachedResult);
          setStages(cachedResult.stages);
          setIsLoading(false);
          setIsTracking(false);
          return;
        }
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
      setStages([]);
      setResult(null);

      try {
        // Create tracker using gov-tracker package
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
          }
        );

        // Track by transaction hash
        const results = await tracker.trackByTxHash(selectedOperation.txHash);

        if (signal.aborted) return;
        if (!isMounted.current) return;

        // Find the matching result by operation ID
        const trackingResult =
          results.find((r) => {
            if (r.input.type === "timelock") {
              return r.input.operationId === selectedOperation.operationId;
            }
            return true; // Take first result if types don't match
          }) || results[0];

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

        // Save to cache
        saveCachedTimelockResult(
          selectedOperation.txHash,
          selectedOperation.operationId,
          timelockResult
        );
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
    ]
  );

  // Select an operation and start tracking
  const selectOperation = useCallback((operation: TimelockOperationInfo) => {
    // Abort any in-flight tracking before selecting new operation
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    // Reset states before setting new operation to avoid showing stale data
    setStages([]);
    setResult(null);
    setError(null);
    setSelectedOperation(operation);
  }, []);

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
