"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { VOTE_COLORS, type VoteType } from "@/lib/badge-colors";
import { formatVotingPower } from "@/lib/format-utils";
import {
  getTallyDataClient,
  useAddressDisplayRecords,
} from "@/lib/tally-data/client";
import type { TallyProposalVoter } from "@/lib/tally-data/types";
import { truncateMiddle } from "@/lib/text-utils";
import { cn } from "@/lib/utils";

const SUPPORT_TYPES: Record<0 | 1 | 2, VoteType> = {
  0: "against",
  1: "for",
  2: "abstain",
};

const SUPPORT_LABELS: Record<VoteType, string> = {
  for: "For",
  against: "Against",
  abstain: "Abstain",
};

function label(
  address: string,
  records: Map<string, { label: string | null }>
) {
  return (
    records.get(address.toLowerCase())?.label ?? truncateMiddle(address, 6, 4)
  );
}

/**
 * Who voted on an L1 voting proposal. The voter is the L1 address that sent
 * the vote; the power it cast is its registered L2 delegate's, named next to
 * it as "for <delegate>".
 */
export function L1ProposalVoters({
  proposalId,
  governorAddress,
}: {
  proposalId: string;
  governorAddress: string;
}) {
  const {
    data: votes,
    isPending,
    error,
  } = useQuery({
    queryKey: ["l1-proposal-votes", governorAddress.toLowerCase(), proposalId],
    queryFn: () =>
      getTallyDataClient().getProposalVotes(proposalId, governorAddress),
    refetchInterval: 30_000,
  });

  const delegates = useMemo(
    () =>
      (votes ?? [])
        .map((vote) => vote.delegate)
        .filter((delegate): delegate is string => Boolean(delegate)),
    [votes]
  );
  const delegateRecords = useAddressDisplayRecords(delegates);

  if (isPending) {
    return <p className="text-sm text-muted-foreground">Loading voters...</p>;
  }
  if (error) {
    return (
      <p className="text-sm text-red-500">
        Failed to load voters: {error.message}
      </p>
    );
  }
  if (!votes || votes.length === 0) {
    return <p className="text-sm text-muted-foreground">No votes yet.</p>;
  }

  return (
    <ul className="divide-y divide-border/50" data-testid="l1-proposal-voters">
      {votes.map((vote) => (
        <VoterRow
          key={`${vote.voter}-${vote.delegate ?? ""}`}
          vote={vote}
          delegateRecords={delegateRecords}
        />
      ))}
    </ul>
  );
}

function VoterRow({
  vote,
  delegateRecords,
}: {
  vote: TallyProposalVoter;
  delegateRecords: Map<string, { label: string | null }>;
}) {
  const support = SUPPORT_TYPES[vote.support];
  const voterLabel = vote.display?.label ?? truncateMiddle(vote.voter, 6, 4);

  return (
    <li className="flex items-center justify-between gap-3 py-2 text-sm">
      <div className="min-w-0">
        <p className="truncate font-medium" title={vote.voter}>
          {voterLabel}
        </p>
        {vote.delegate && (
          <p
            className="truncate text-xs text-muted-foreground"
            title={vote.delegate}
          >
            for {label(vote.delegate, delegateRecords)}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2 text-xs">
        <span className={cn("font-semibold", VOTE_COLORS[support].text)}>
          {SUPPORT_LABELS[support]}
        </span>
        <span className="tabular-nums text-muted-foreground">
          {formatVotingPower(vote.weight)}
        </span>
      </div>
    </li>
  );
}
