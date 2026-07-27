"use client";

import { useQuery } from "@tanstack/react-query";

export type DelegateCountResult = {
  count: number;
  minVotingPowerArb: number;
  minVotingPower: string;
};

export const delegateCountKey = ["delegate-count"] as const;

async function fetchDelegateCount(): Promise<DelegateCountResult> {
  const response = await fetch("/api/delegate-count", {
    headers: { accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Delegate count request failed: ${response.status}`);
  }
  return (await response.json()) as DelegateCountResult;
}

/**
 * How many delegates hold at least the app-wide minimum voting power.
 *
 * Served by `/api/delegate-count`, which is env-configured and answers 503 when
 * the governance indexer is unset, so a failure here is expected in local dev
 * and callers must render it as "no figure" rather than an error.
 */
export function useDelegateCount() {
  return useQuery({
    queryKey: delegateCountKey,
    queryFn: fetchDelegateCount,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
}
