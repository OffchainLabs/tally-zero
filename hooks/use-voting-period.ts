"use client";

import { useMemo } from "react";

import { useQuery } from "@tanstack/react-query";

import {
  estimateVotingPeriodFromBlocks,
  isVotingExtensionStillPossible,
  resolveMinedBlockNumbers,
  type EstimatedVotingPeriod,
} from "@/components/proposal/stages/stage-utils";

import { useL1Block } from "./use-l1-block";
import { useL1BlockTimestamps } from "./use-l1-block-timestamps";
import { useRpcSettings } from "./use-rpc-settings";

// Governor function selectors, verified with viem's toFunctionSelector
const PROPOSAL_DEADLINE_SELECTOR = "0xc01f9e37"; // proposalDeadline(uint256)
const PROPOSAL_VOTES_SELECTOR = "0x544ffc9c"; // proposalVotes(uint256)
const QUORUM_SELECTOR = "0xf8ce560a"; // quorum(uint256)

/** ABI-encode a call taking a single uint256 argument */
export function encodeUint256Call(selector: string, value: bigint): string {
  return selector + value.toString(16).padStart(64, "0");
}

/** Decode proposalVotes(uint256) → (against, for, abstain) */
export function decodeProposalVotes(result: string): {
  forVotes: bigint;
  abstainVotes: bigint;
} {
  const body = result.slice(2);
  return {
    forVotes: BigInt(`0x${body.slice(64, 128)}`),
    abstainVotes: BigInt(`0x${body.slice(128, 192)}`),
  };
}

async function ethCall(
  rpcUrl: string,
  to: string,
  data: string
): Promise<string> {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "eth_call",
      params: [{ to, data }, "latest"],
      id: 1,
    }),
  });
  const payload = await response.json();
  if (typeof payload?.result !== "string" || payload.result === "0x") {
    throw new Error(payload?.error?.message ?? "eth_call returned no result");
  }
  return payload.result;
}

interface OnChainVotingState {
  /** proposalDeadline(): the actual end block, reflecting extensions */
  deadlineBlock: number;
  /** Whether for + abstain votes meet the quorum at the snapshot block */
  quorumReached: boolean;
}

async function fetchOnChainVotingState(
  l2Rpc: string,
  governorAddress: string,
  proposalId: string,
  minedSnapshotBlock: number | null
): Promise<OnChainVotingState> {
  const id = BigInt(proposalId);
  const [deadlineHex, votesHex, quorumHex] = await Promise.all([
    ethCall(
      l2Rpc,
      governorAddress,
      encodeUint256Call(PROPOSAL_DEADLINE_SELECTOR, id)
    ),
    ethCall(
      l2Rpc,
      governorAddress,
      encodeUint256Call(PROPOSAL_VOTES_SELECTOR, id)
    ),
    // quorum(block) reverts for blocks that are not mined yet (pending
    // proposals); quorum is trivially not reached before voting starts
    minedSnapshotBlock
      ? ethCall(
          l2Rpc,
          governorAddress,
          encodeUint256Call(QUORUM_SELECTOR, BigInt(minedSnapshotBlock))
        )
      : Promise.resolve(null),
  ]);

  const { forVotes, abstainVotes } = decodeProposalVotes(votesHex);
  const quorumReached = quorumHex
    ? forVotes + abstainVotes >= BigInt(quorumHex)
    : false;

  return { deadlineBlock: Number(BigInt(deadlineHex)), quorumReached };
}

export interface UseVotingPeriodParams {
  proposalId?: string;
  governorAddress?: string;
  /** Vote start block from the ProposalCreated event (proposalSnapshot) */
  startBlock?: string;
  /** Scheduled vote end block from the ProposalCreated event */
  endBlock?: string;
}

export interface UseVotingPeriodResult {
  votingPeriod: EstimatedVotingPeriod | null;
  /** Single source of truth for the "+2d extension possible" badge */
  extensionStillPossible: boolean;
  quorumReached: boolean;
}

/**
 * Single source of truth for a proposal's voting period display.
 *
 * Every surface showing the voting period (vote summary card, Lifecycle
 * tab) calls this hook with the same inputs; results come from the shared
 * query cache, so all surfaces render identical data by construction.
 *
 * The end block and quorum state are read from the governor on-chain
 * (`proposalDeadline` reflects late-quorum extensions, unlike the event's
 * scheduled endBlock), falling back to the event data while loading.
 */
export function useVotingPeriod({
  proposalId,
  governorAddress,
  startBlock,
  endBlock,
}: UseVotingPeriodParams): UseVotingPeriodResult {
  const { l2Rpc, isHydrated } = useRpcSettings();
  const { currentL1Block } = useL1Block();

  const minedSnapshotBlock = useMemo(() => {
    const [mined] = resolveMinedBlockNumbers([startBlock], currentL1Block);
    return mined ?? null;
  }, [startBlock, currentL1Block]);

  const onChainQuery = useQuery({
    queryKey: [
      "voting-period-state",
      l2Rpc,
      governorAddress,
      proposalId,
      minedSnapshotBlock,
    ],
    queryFn: () =>
      fetchOnChainVotingState(
        l2Rpc,
        governorAddress as string,
        proposalId as string,
        minedSnapshotBlock
      ),
    enabled:
      isHydrated && Boolean(proposalId && governorAddress && currentL1Block),
    staleTime: 60_000,
    retry: 1,
  });

  // proposalDeadline returns 0 for unknown proposals; keep the event data
  const deadlineBlock = onChainQuery.data?.deadlineBlock;
  const effectiveEndBlock =
    deadlineBlock && deadlineBlock > 0 ? String(deadlineBlock) : endBlock;
  const quorumReached = onChainQuery.data?.quorumReached ?? false;

  const minedBoundaryBlocks = useMemo(
    () =>
      resolveMinedBlockNumbers([startBlock, effectiveEndBlock], currentL1Block),
    [startBlock, effectiveEndBlock, currentL1Block]
  );
  const realTimestamps = useL1BlockTimestamps(minedBoundaryBlocks);

  const votingPeriod = estimateVotingPeriodFromBlocks(
    startBlock,
    effectiveEndBlock,
    currentL1Block,
    { realTimestamps, quorumReached }
  );

  return {
    votingPeriod,
    extensionStillPossible: votingPeriod
      ? isVotingExtensionStillPossible(votingPeriod.range, quorumReached)
      : false,
    quorumReached,
  };
}
