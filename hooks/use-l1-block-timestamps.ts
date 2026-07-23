"use client";

import { useQueries } from "@tanstack/react-query";

import { useRpcSettings } from "./use-rpc-settings";

async function fetchL1BlockTimestamp(
  l1Rpc: string,
  blockNumber: number
): Promise<number> {
  const response = await fetch(l1Rpc, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "eth_getBlockByNumber",
      params: [`0x${blockNumber.toString(16)}`, false],
      id: 1,
    }),
  });
  const data = await response.json();
  const timestamp = data?.result?.timestamp;
  if (typeof timestamp !== "string") {
    throw new Error(`No timestamp for L1 block ${blockNumber}`);
  }
  return parseInt(timestamp, 16);
}

/**
 * Fetch the real timestamps (unix seconds) of already-mined L1 blocks.
 *
 * Mined block timestamps never change, so each block is cached indefinitely
 * and shared across all consumers via the query cache. Returns a map of
 * block number → timestamp containing only the blocks resolved so far;
 * callers fall back to estimation for missing entries.
 */
export function useL1BlockTimestamps(
  blockNumbers: number[]
): Map<number, number> {
  const { l1Rpc, isHydrated } = useRpcSettings();

  const results = useQueries({
    queries: blockNumbers.map((blockNumber) => ({
      queryKey: ["l1-block-timestamp", l1Rpc, blockNumber],
      queryFn: () => fetchL1BlockTimestamp(l1Rpc, blockNumber),
      enabled: isHydrated,
      staleTime: Infinity,
      retry: 1,
    })),
  });

  const timestamps = new Map<number, number>();
  results.forEach((result, index) => {
    if (typeof result.data === "number") {
      timestamps.set(blockNumbers[index], result.data);
    }
  });
  return timestamps;
}
