"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo, useRef } from "react";

import { getErrorMessage } from "@/lib/error-utils";
import { hasPendingIndexerStage, mapIndexerStages } from "@/lib/indexer-stages";
import { getProposalStages } from "@/lib/tally-data/client";
import type { IndexerProposalStages } from "@/lib/tally-data/types";
import type { ProposalStage } from "@/types/proposal-stage";

/** How often a proposal with a stage still pending is re-read */
const PENDING_REFETCH_INTERVAL_MS = 60_000;
/** After the user acts on a stage (redeem, execute), how often and how long to follow it */
const FOLLOW_UP_INTERVAL_MS = 5_000;
const FOLLOW_UP_WINDOW_MS = 120_000;

/**
 * When to re-read: never once nothing is pending; quickly for a while after the user acted
 * (the indexer records the result seconds later), otherwise at the slow cadence.
 */
export function stagesPollInterval(
  hasPending: boolean,
  followUntil: number,
  now = Date.now()
): number | false {
  if (!hasPending) return false;
  return now < followUntil
    ? FOLLOW_UP_INTERVAL_MS
    : PENDING_REFETCH_INTERVAL_MS;
}

export interface UseIndexerProposalStagesOptions {
  proposalId: string;
  governorAddress: string;
  enabled?: boolean;
}

export interface UseIndexerProposalStagesResult {
  /** The endpoint's response, or null before it arrives or when unknown */
  data: IndexerProposalStages | null;
  /** The same stages shaped like gov-tracker's, for the shared components */
  stages: ProposalStage[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export function indexerProposalStagesQueryKey(
  governorAddress: string,
  proposalId: string
) {
  return [
    "indexer-proposal-stages",
    governorAddress.toLowerCase(),
    proposalId,
  ] as const;
}

/**
 * A proposal's lifecycle stages from the governance indexer. One request where
 * gov-tracker walks the chain, so it is safe to call for any row; it is polled
 * while a stage is still pending.
 */
export function useIndexerProposalStages({
  proposalId,
  governorAddress,
  enabled = true,
}: UseIndexerProposalStagesOptions): UseIndexerProposalStagesResult {
  const isEnabled = enabled && Boolean(proposalId && governorAddress);
  const followUntil = useRef(0);

  const query = useQuery({
    queryKey: indexerProposalStagesQueryKey(governorAddress, proposalId),
    queryFn: () => getProposalStages(governorAddress, proposalId),
    enabled: isEnabled,
    staleTime: PENDING_REFETCH_INTERVAL_MS / 2,
    refetchInterval: (current) =>
      stagesPollInterval(
        hasPendingIndexerStage(current.state.data),
        followUntil.current
      ),
  });

  const data = query.data ?? null;
  const stages = useMemo(() => (data ? mapIndexerStages(data) : []), [data]);
  const { refetch } = query;

  return {
    data,
    stages,
    isLoading: isEnabled && query.isPending,
    error: query.error ? getErrorMessage(query.error) : null,
    // A refetch follows a user action on a stage: keep watching until the indexer has it.
    refetch: () => {
      followUntil.current = Date.now() + FOLLOW_UP_WINDOW_MS;
      void refetch();
    },
  };
}
