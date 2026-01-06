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

    // Only show percentages for segments that have votes
    const segments = [
      { pct: forPct, label: `${Math.round(forPct)}%`, type: "for" as const },
      {
        pct: againstPct,
        label: `${Math.round(againstPct)}%`,
        type: "against" as const,
      },
      {
        pct: abstainPct,
        label: `${Math.round(abstainPct)}%`,
        type: "abstain" as const,
      },
    ].filter((s) => s.pct > 0);

    return (
      <div className="w-24 space-y-0.5">
        {/* Stacked bar with glassmorphism */}
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

        {/* Compact percentage labels */}
        <div className="flex justify-between text-[10px] text-muted-foreground">
          {segments.map((segment) => (
            <span key={segment.type} className={VOTE_COLORS[segment.type].text}>
              {segment.label}
            </span>
          ))}
        </div>
      </div>
    );
  }
);
