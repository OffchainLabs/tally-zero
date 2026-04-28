"use client";

import { Card, CardContent } from "@/components/ui/Card";
import { getGovernorByAddress } from "@/config/governors";
import { useTotalDelegationAt } from "@/hooks/use-total-delegation-at";
import { VOTE_COLORS } from "@/lib/badge-colors";
import {
  calculateDvpQuorum,
  isAfterDvpQuorumActivation,
} from "@/lib/dvp-quorum";
import { formatVotingPower } from "@/lib/format-utils";
import { cn } from "@/lib/utils";
import {
  calculatePreciseQuorumProgress,
  calculateVoteDistribution,
  sumVoteCounts,
} from "@/lib/vote-utils";
import type { ProposalVotes } from "@/types/proposal";

export function ProposalVoteSummaryCard({
  proposalId,
  governorAddress,
  snapshotBlock,
  votes,
}: {
  proposalId: string;
  governorAddress: string;
  snapshotBlock: string;
  votes?: ProposalVotes | null;
}) {
  const governorConfig = getGovernorByAddress(governorAddress);
  const forVotes = votes?.forVotes ?? "0";
  const againstVotes = votes?.againstVotes ?? "0";
  const abstainVotes = votes?.abstainVotes ?? "0";
  const isDvpQuorumProposal =
    Boolean(governorConfig?.type) &&
    isAfterDvpQuorumActivation(proposalId, snapshotBlock);
  const totalDelegation = useTotalDelegationAt(
    snapshotBlock,
    isDvpQuorumProposal
  );
  const dvpQuorum = calculateDvpQuorum(totalDelegation, governorConfig?.type);
  const quorum = isDvpQuorumProposal ? dvpQuorum : votes?.quorum;
  const votesTowardQuorum = sumVoteCounts(forVotes, abstainVotes);
  const { forPct, againstPct, abstainPct, hasVotes } =
    calculateVoteDistribution(forVotes, againstVotes, abstainVotes);
  const quorumProgress = quorum
    ? calculatePreciseQuorumProgress(votesTowardQuorum, quorum)
    : null;
  const proposalTypeLabel =
    governorConfig?.type === "core"
      ? "Constitutional Quorum"
      : governorConfig?.type === "treasury"
        ? "Non-Constitutional Quorum"
        : "Proposal Quorum";

  const voteLegendItems = [
    {
      label: "For",
      value: forVotes,
      percentage: forPct,
      colors: VOTE_COLORS.for,
    },
    {
      label: "Against",
      value: againstVotes,
      percentage: againstPct,
      colors: VOTE_COLORS.against,
    },
    {
      label: "Abstain",
      value: abstainVotes,
      percentage: abstainPct,
      colors: VOTE_COLORS.abstain,
    },
  ] as const;

  return (
    <Card
      variant="glass"
      className="rounded-2xl border border-white/40 shadow-lg shadow-black/5 dark:border-white/10 max-h-fit"
    >
      <CardContent className="p-4 md:p-6">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">
                {proposalTypeLabel}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {governorConfig?.name ?? "Unknown governor"}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
            {voteLegendItems.map(({ label, value, percentage, colors }) => (
              <div key={label} className="flex items-center gap-1.5">
                <span className={cn("h-2 w-2 rounded-full", colors.dot)} />
                <span className={cn("font-medium", colors.text)}>{label}</span>
                <span className="tabular-nums text-foreground">
                  {formatVotingPower(value)}
                </span>
                <span className="tabular-nums text-muted-foreground">
                  {percentage.toFixed(1)}%
                </span>
              </div>
            ))}
          </div>

          <div className="flex h-3 overflow-hidden rounded-full bg-black/5 dark:bg-white/10">
            {forPct > 0 && (
              <div
                className={cn(VOTE_COLORS.for.gradient, "transition-all")}
                style={{ width: `${forPct}%` }}
              />
            )}
            {againstPct > 0 && (
              <div
                className={cn(VOTE_COLORS.against.gradient, "transition-all")}
                style={{ width: `${againstPct}%` }}
              />
            )}
            {abstainPct > 0 && (
              <div
                className={cn(VOTE_COLORS.abstain.gradient, "transition-all")}
                style={{ width: `${abstainPct}%` }}
              />
            )}
          </div>

          {quorum ? (
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="text-muted-foreground">
                  {formatVotingPower(votesTowardQuorum)} /{" "}
                  {formatVotingPower(quorum)} ARB
                </span>
                <span className="text-muted-foreground">
                  {isDvpQuorumProposal ? "DVP Quorum" : "Quorum"}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-black/5 dark:bg-white/10">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-500",
                    VOTE_COLORS.for.gradient
                  )}
                  style={{
                    width: `${quorumProgress?.progressPercentage ?? 0}%`,
                  }}
                />
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Quorum data is not available for this proposal yet.
            </p>
          )}

          {!hasVotes && (
            <p className="text-xs text-muted-foreground">
              No votes recorded yet.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
