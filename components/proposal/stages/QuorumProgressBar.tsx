"use client";

import { CheckCircledIcon, TargetIcon } from "@radix-ui/react-icons";
import { memo } from "react";

import { QUORUM_COLORS } from "@/lib/badge-colors";
import { formatVotingPower } from "@/lib/format-utils";
import { cn } from "@/lib/utils";
import { calculateQuorumProgress } from "@/lib/vote-utils";

export interface QuorumProgressBarProps {
  current: string;
  required: string;
  reached: boolean;
}

export const QuorumProgressBar = memo(function QuorumProgressBar({
  current,
  required,
  reached,
}: QuorumProgressBarProps) {
  const { percentage, isReached } = calculateQuorumProgress(
    current,
    required,
    reached
  );
  const colors = isReached ? QUORUM_COLORS.reached : QUORUM_COLORS.pending;

  return (
    <div className="glass-subtle backdrop-blur rounded-lg px-3 py-2 space-y-2">
      {/* Header with icon and status */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isReached ? (
            <CheckCircledIcon className={cn("h-4 w-4", colors.icon)} />
          ) : (
            <TargetIcon className={cn("h-4 w-4", colors.icon)} />
          )}
          <span className="text-xs font-semibold text-foreground">
            Quorum {isReached ? "Reached" : "Progress"}
          </span>
        </div>
        <span className={cn("text-sm font-bold tabular-nums", colors.text)}>
          {percentage.toFixed(0)}%
        </span>
      </div>

      {/* Progress bar with gradient */}
      <div className="h-2 rounded-full overflow-hidden bg-white/10 dark:bg-white/5">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500 ease-out",
            colors.gradient
          )}
          style={{ width: `${percentage}%` }}
        />
      </div>

      {/* Vote counts */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="tabular-nums">{formatVotingPower(current)} votes</span>
        <span className="tabular-nums">
          {formatVotingPower(required)} required
        </span>
      </div>
    </div>
  );
});
