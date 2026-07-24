"use client";

import { memo } from "react";

import { VOTE_COLORS } from "@/lib/badge-colors";
import { cn } from "@/lib/utils";
import { calculateVoteDistribution } from "@/lib/vote-utils";
import type { ProposalVotes } from "@/types/proposal";

export interface VoteDistributionBarCompactProps {
  votes: ProposalVotes | undefined;
}

export const VoteDistributionBarCompact = memo(
  function VoteDistributionBarCompact({
    votes,
  }: VoteDistributionBarCompactProps) {
    if (!votes) {
      return (
        <span className="text-muted-foreground text-xs font-medium">-</span>
      );
    }

    const { forPct, againstPct, abstainPct, hasVotes } =
      calculateVoteDistribution(
        votes.forVotes,
        votes.againstVotes,
        votes.abstainVotes
      );

    if (!hasVotes) {
      return (
        <span className="text-muted-foreground text-xs font-medium">-</span>
      );
    }

    // Show all three percentages (For / Against / Abstain), matching the design.
    const segments = [
      { pct: forPct, type: "for" as const },
      { pct: againstPct, type: "against" as const },
      { pct: abstainPct, type: "abstain" as const },
    ];

    return (
      <div className="w-24 space-y-1">
        {/* Stacked 6px bar */}
        <div className="flex h-1.5 rounded-full overflow-hidden bg-white/10 backdrop-blur-sm">
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

        {/* Percentage labels: always For / Against / Abstain */}
        <div className="flex justify-between text-[10px] font-medium tabular-nums">
          {segments.map((segment) => (
            <span key={segment.type} className={VOTE_COLORS[segment.type].text}>
              {Math.round(segment.pct)}%
            </span>
          ))}
        </div>
      </div>
    );
  }
);
