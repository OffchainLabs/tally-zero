"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo } from "react";

import { GovernorBadge } from "@/components/ui/GovernorBadge";
import { Skeleton } from "@/components/ui/Skeleton";
import type { DelegateVoteRecord } from "@/hooks/use-delegate-votes";
import { formatVotingPower } from "@/lib/format-utils";
import { formatCurrentState, getStateStyle } from "@/lib/lifecycle-utils";
import { buildProposalPath } from "@/lib/proposal-url";
import { extractProposalTitle } from "@/lib/text-utils";
import { cn } from "@/lib/utils";
import type { ParsedProposal } from "@/types/proposal";

type VoteChoice =
  | "for"
  | "against"
  | "abstain"
  | "did_not_vote"
  | "not_eligible"
  | "unknown";

interface DelegateVotesTableProps {
  proposals: ParsedProposal[];
  votesByKey: Map<string, DelegateVoteRecord>;
  eligibilityByBlock: Map<string, bigint> | null;
  isLoading: boolean;
}

const supportToChoice = (support: number): VoteChoice => {
  if (support === 0) return "against";
  if (support === 1) return "for";
  if (support === 2) return "abstain";
  return "unknown";
};

const choiceLabel: Record<VoteChoice, string> = {
  for: "For",
  against: "Against",
  abstain: "Abstain",
  did_not_vote: "Did not vote",
  not_eligible: "Not eligible",
  unknown: "—",
};

const choiceClass: Record<VoteChoice, string> = {
  for: "text-emerald-700 dark:text-emerald-400",
  against: "text-rose-700 dark:text-rose-400",
  abstain: "text-amber-700 dark:text-amber-400",
  did_not_vote: "text-muted-foreground",
  not_eligible: "text-muted-foreground/70 italic",
  unknown: "text-muted-foreground",
};

function proposalKey(proposal: ParsedProposal): string {
  return `${proposal.id}:${proposal.contractAddress.toLowerCase()}`;
}

function compareProposals(a: ParsedProposal, b: ParsedProposal): number {
  const startA = Number(a.startBlock);
  const startB = Number(b.startBlock);
  return startB - startA;
}

export function DelegateVotesTable({
  proposals,
  votesByKey,
  eligibilityByBlock,
  isLoading,
}: DelegateVotesTableProps) {
  const router = useRouter();

  const sortedProposals = useMemo(
    () => [...proposals].sort(compareProposals),
    [proposals]
  );

  if (isLoading && proposals.length === 0) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  if (proposals.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No proposals found.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="py-2 pr-3 font-medium">Proposal</th>
            <th className="py-2 px-3 font-medium">Governor</th>
            <th className="py-2 px-3 font-medium">Status</th>
            <th className="py-2 px-3 font-medium">Vote</th>
            <th className="py-2 pl-3 font-medium text-right">Weight</th>
          </tr>
        </thead>
        <tbody>
          {sortedProposals.map((proposal) => {
            const key = proposalKey(proposal);
            const vote = votesByKey.get(key);
            const path = buildProposalPath({
              proposalId: proposal.id,
              governorAddress: proposal.contractAddress,
            });

            let choice: VoteChoice;
            if (vote) {
              choice = supportToChoice(vote.support);
            } else if (eligibilityByBlock) {
              const power = eligibilityByBlock.get(String(proposal.startBlock));
              if (power === undefined) {
                choice = "unknown";
              } else if (power > BigInt(0)) {
                choice = "did_not_vote";
              } else {
                choice = "not_eligible";
              }
            } else {
              choice = "unknown";
            }

            const stateStyle = getStateStyle(proposal.state);
            const stateLabel = formatCurrentState(proposal.state);
            const title =
              extractProposalTitle(proposal.description) ||
              `Proposal ${proposal.id.slice(0, 10)}…`;

            return (
              <tr
                key={key}
                onClick={() => router.push(path)}
                className="border-b border-border/40 cursor-pointer transition-colors hover:bg-white/30 dark:hover:bg-white/5"
              >
                <td className="py-3 pr-3 max-w-md">
                  <Link
                    href={path}
                    className="line-clamp-1 hover:underline"
                    onClick={(event) => event.stopPropagation()}
                  >
                    {title}
                  </Link>
                </td>
                <td className="py-3 px-3 whitespace-nowrap">
                  {proposal.governorName && (
                    <GovernorBadge
                      governorName={proposal.governorName}
                      size="sm"
                    />
                  )}
                </td>
                <td className="py-3 px-3 whitespace-nowrap">
                  <span className={cn("text-xs font-medium", stateStyle.color)}>
                    {stateLabel}
                  </span>
                </td>
                <td
                  className={cn(
                    "py-3 px-3 whitespace-nowrap font-medium",
                    choiceClass[choice]
                  )}
                >
                  {choiceLabel[choice]}
                </td>
                <td className="py-3 pl-3 whitespace-nowrap text-right tabular-nums text-muted-foreground">
                  {vote ? `${formatVotingPower(vote.weight)} ARB` : ""}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
