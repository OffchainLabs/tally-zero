"use client";

import { memo } from "react";

import { QUORUM_COLORS } from "@/lib/badge-colors";
import { formatVotingPower } from "@/lib/format-utils";
import { cn } from "@/lib/utils";
import { calculateQuorumProgress } from "@/lib/vote-utils";

export interface QuorumIndicatorProps {
  /** Votes counting toward quorum, in wei */
  current: string;
  /** Quorum requirement, in wei */
  required: string;
  reached?: boolean;
  /**
   * Also print `current / required` as compact vote counts next to the
   * percentage. Off by default because some callers pass a 1/1 sentinel for
   * "reached" with no real counts to show.
   */
  showCounts?: boolean;
}

export const QuorumIndicator = memo(function QuorumIndicator({
  current,
  required,
  reached,
  showCounts = false,
}: QuorumIndicatorProps) {
  const { percentage, isReached } = calculateQuorumProgress(
    current,
    required,
    reached
  );
  const colors = isReached ? QUORUM_COLORS.reached : QUORUM_COLORS.pending;
  // One decimal keeps "176.8M / 160.9M" on the label row at this width.
  const counts = showCounts
    ? `${formatVotingPower(current, 1)} / ${formatVotingPower(required, 1)}`
    : null;

  return (
    <div
      className="w-32 space-y-1"
      title={
        counts
          ? `Quorum: ${percentage.toFixed(0)}% of required votes (${counts})`
          : `Quorum: ${percentage.toFixed(0)}% of required votes`
      }
    >
      {/* Progress track (6px) */}
      <div className="h-1.5 rounded-full overflow-hidden bg-white/10">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500 ease-out",
            colors.gradient
          )}
          style={{ width: `${Math.min(percentage, 100)}%` }}
        />
      </div>

      {/* Percentage label, with the counts behind it when asked for */}
      <div className="flex items-baseline justify-between gap-2 whitespace-nowrap text-[10px] font-medium tabular-nums">
        <span className={cn("transition-colors duration-300", colors.text)}>
          {percentage.toFixed(0)}%
        </span>
        {counts && <span className="text-muted-foreground">{counts}</span>}
      </div>
    </div>
  );
});
