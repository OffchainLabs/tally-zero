"use client";

/**
 * Hook for monitoring RPC endpoint health
 * Provides health checking, status tracking, and summary statistics
 */

import { useCallback, useEffect, useState } from "react";

import { debug } from "@/lib/debug";
import {
  checkAllRpcHealth,
  DEFAULT_RPC_ENDPOINTS,
  getRpcHealthSummary,
  type RpcHealthResult,
} from "@/lib/rpc-health";

/** Options for configuring RPC health monitoring */
export interface UseRpcHealthOptions {
  customUrls?: {
    arb1?: string;
    nova?: string;
    l1?: string;
  };
  chunkSizes?: {
    arb1?: number;
    nova?: number;
    l1?: number;
  };
  autoCheck?: boolean;
}

/** Return type for useRpcHealth hook */
export interface UseRpcHealthResult {
  /** Health check results for each RPC endpoint */
  results: RpcHealthResult[];
  /** Whether health check is in progress */
  isChecking: boolean;
  /** Timestamp of last completed health check */
  lastCheckedAt: Date | null;
  /** Summary statistics of RPC health */
  summary: {
    allHealthy: boolean;
    requiredHealthy: boolean;
    healthyCount: number;
    totalCount: number;
  } | null;
  /** Function to manually trigger health check */
  checkHealth: () => Promise<void>;
}

/**
 * Hook for monitoring RPC endpoint health status
 * @param options - Configuration options for health monitoring
 * @returns Health check results, status, and control functions
 */
export function useRpcHealth({
  customUrls,
  chunkSizes,
  autoCheck = true,
}: UseRpcHealthOptions = {}): UseRpcHealthResult {
  const [results, setResults] = useState<RpcHealthResult[]>([]);
  const [isChecking, setIsChecking] = useState(false);
  const [lastCheckedAt, setLastCheckedAt] = useState<Date | null>(null);

  const checkHealth = useCallback(async () => {
    setIsChecking(true);

    setResults(
      DEFAULT_RPC_ENDPOINTS.map((endpoint) => ({
        id: endpoint.id,
        name: endpoint.name,
        url: "",
        status: "checking" as const,
      }))
    );

    try {
      const healthResults = await checkAllRpcHealth(customUrls, chunkSizes);
      setResults(healthResults);
      setLastCheckedAt(new Date());
    } catch (error) {
      debug.rpc("failed to check RPC health: %O", error);
    } finally {
      setIsChecking(false);
    }
  }, [customUrls, chunkSizes]);

  // Auto-check on mount
  useEffect(() => {
    if (autoCheck) {
      checkHealth();
    }
  }, [autoCheck, checkHealth]);

  const summary =
    results.length > 0 && !isChecking ? getRpcHealthSummary(results) : null;

  return {
    results,
    isChecking,
    lastCheckedAt,
    summary,
    checkHealth,
  };
}
