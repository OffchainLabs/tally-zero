"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useBlockNumber, useReadContracts } from "wagmi";

import { L1ArbitrumGovernorAbi } from "@/data/abis/L1ArbitrumGovernorAbi";
import { getErrorMessage } from "@/lib/error-utils";
import { getTallyDataClient } from "@/lib/tally-data/client";
import type {
  TallyProposalIndexEntry,
  TallyProposalVoteSummary,
} from "@/lib/tally-data/types";

const REFRESH_INTERVAL_MS = 30_000;

export interface L1ProposalOnChain {
  /** The governor's numeric `state()` */
  state?: number;
  snapshotBlock?: number;
  deadlineBlock?: number;
  snapshotLocked?: boolean;
}

export interface UseL1ProposalResult {
  entry: TallyProposalIndexEntry | null;
  voteSummary: TallyProposalVoteSummary | null;
  onChain: L1ProposalOnChain;
  /** The L1 chain's head, the governor's clock */
  currentBlock: number | null;
  isLoading: boolean;
  error: string | null;
}

function parseProposalId(proposalId: string): bigint | null {
  try {
    return BigInt(proposalId);
  } catch {
    return null;
  }
}

/**
 * An L1 voting proposal: the indexer's entry and vote totals, plus the
 * governor's own state, snapshot and deadline read from its L1 chain. Nothing
 * here touches the Arbitrum One RPC that `useProposalById` reads.
 */
export function useL1Proposal({
  proposalId,
  governorAddress,
  chainId,
}: {
  proposalId: string;
  governorAddress: string;
  chainId: number;
}): UseL1ProposalResult {
  const client = getTallyDataClient();
  const governorKey = governorAddress.toLowerCase();

  const entryQuery = useQuery({
    queryKey: ["l1-proposal-entry", governorKey, proposalId],
    queryFn: () => client.getProposalIndexEntry(proposalId, governorAddress),
    refetchInterval: REFRESH_INTERVAL_MS,
  });

  const summaryQuery = useQuery({
    queryKey: ["l1-proposal-vote-summary", governorKey, proposalId],
    queryFn: () => client.getProposalVoteSummary(proposalId, governorAddress),
    refetchInterval: REFRESH_INTERVAL_MS,
  });

  const id = parseProposalId(proposalId);
  const governor = governorAddress as `0x${string}`;
  const reads = useReadContracts({
    allowFailure: true,
    contracts: [
      {
        address: governor,
        abi: L1ArbitrumGovernorAbi,
        functionName: "state",
        args: [id ?? BigInt(0)],
        chainId,
      },
      {
        address: governor,
        abi: L1ArbitrumGovernorAbi,
        functionName: "proposalSnapshot",
        args: [id ?? BigInt(0)],
        chainId,
      },
      {
        address: governor,
        abi: L1ArbitrumGovernorAbi,
        functionName: "proposalDeadline",
        args: [id ?? BigInt(0)],
        chainId,
      },
      {
        address: governor,
        abi: L1ArbitrumGovernorAbi,
        functionName: "proposalSnapshotLocked",
        args: [id ?? BigInt(0)],
        chainId,
      },
    ],
    query: { enabled: id !== null, refetchInterval: REFRESH_INTERVAL_MS },
  });

  const { data: blockNumber } = useBlockNumber({
    chainId,
    query: { refetchInterval: REFRESH_INTERVAL_MS },
  });

  const onChain = useMemo<L1ProposalOnChain>(() => {
    const [state, snapshot, deadline, locked] = reads.data ?? [];
    return {
      state: state?.status === "success" ? Number(state.result) : undefined,
      snapshotBlock:
        snapshot?.status === "success" ? Number(snapshot.result) : undefined,
      deadlineBlock:
        deadline?.status === "success" ? Number(deadline.result) : undefined,
      snapshotLocked:
        locked?.status === "success" ? Boolean(locked.result) : undefined,
    };
  }, [reads.data]);

  const error = entryQuery.error ?? summaryQuery.error;

  return {
    entry: entryQuery.data ?? null,
    voteSummary: summaryQuery.data ?? null,
    onChain,
    currentBlock: blockNumber === undefined ? null : Number(blockNumber),
    isLoading: entryQuery.isPending,
    error: error ? getErrorMessage(error) : null,
  };
}
