"use client";

import { memo } from "react";

import { VOTE_COLORS } from "@/lib/badge-colors";
import { cn } from "@/lib/utils";
import { calculateVoteDistribution } from "@/lib/vote-utils";

export interface VoteDistributionBarProps {
  forVotes: string;
  againstVotes: string;
  abstainVotes: string;
}

export const VoteDistributionBar = memo(function VoteDistributionBar({
  forVotes,
  againstVotes,
  abstainVotes,
}: VoteDistributionBarProps) {
  const { forPct, againstPct, abstainPct, hasVotes } =
    calculateVoteDistribution(forVotes, againstVotes, abstainVotes);

  if (!hasVotes) return null;

  return (
    <div className="space-y-1.5">
      <span className="text-xs font-medium text-muted-foreground">Votes</span>
      <div className="flex h-2 rounded-full overflow-hidden bg-secondary">
        {forPct > 0 && (
          <div
            className={cn(VOTE_COLORS.for.bg, "transition-all")}
            style={{ width: `${forPct}%` }}
          />
        )}
        {againstPct > 0 && (
          <div
            className={cn(VOTE_COLORS.against.bg, "transition-all")}
            style={{ width: `${againstPct}%` }}
          />
        )}
        {abstainPct > 0 && (
          <div
            className={cn(VOTE_COLORS.abstain.bg, "transition-all")}
            style={{ width: `${abstainPct}%` }}
          />
        )}
      </div>
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-1.5">
          <span className={cn("w-2 h-2 rounded-full", VOTE_COLORS.for.dot)} />
          <span className={VOTE_COLORS.for.text}>{forPct.toFixed(1)}%</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className={cn("w-2 h-2 rounded-full", VOTE_COLORS.against.dot)}
          />
          <span className={VOTE_COLORS.against.text}>
            {againstPct.toFixed(1)}%
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className={cn("w-2 h-2 rounded-full", VOTE_COLORS.abstain.dot)}
          />
          <span className={VOTE_COLORS.abstain.text}>
            {abstainPct.toFixed(1)}%
          </span>
        </div>
      </div>
    </div>
  );
});
