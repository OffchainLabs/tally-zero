"use client";

import { useQuery } from "@tanstack/react-query";

import { useRpcSettings } from "./use-rpc-settings";

const L1_BLOCK_REFRESH_INTERVAL_MS = 60000;

interface UseL1BlockResult {
  currentL1Block: number | null;
  isLoading: boolean;
}

async function fetchL1BlockNumber(l1Rpc: string): Promise<number> {
  const response = await fetch(l1Rpc, {
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
  if (typeof data?.result !== "string") {
    throw new Error("eth_blockNumber returned no result");
  }
  return parseInt(data.result, 16);
}

/**
 * Hook for the current L1 block number, refreshed periodically.
 *
 * Served from the shared query cache so every consumer sees the same block
 * height at the same time; this keeps block-derived dates identical across
 * surfaces (e.g. the vote summary card and the Lifecycle tab).
 */
export function useL1Block(): UseL1BlockResult {
  const { l1Rpc, isHydrated } = useRpcSettings();

  const query = useQuery({
    queryKey: ["l1-block-number", l1Rpc],
    queryFn: () => fetchL1BlockNumber(l1Rpc),
    enabled: isHydrated,
    refetchInterval: L1_BLOCK_REFRESH_INTERVAL_MS,
    staleTime: L1_BLOCK_REFRESH_INTERVAL_MS / 2,
    retry: 1,
  });

  return {
    currentL1Block: query.data ?? null,
    isLoading: query.isPending,
  };
}
