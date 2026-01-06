"use client";

import { CheckIcon } from "@radix-ui/react-icons";
import { memo } from "react";

import { QUORUM_COLORS } from "@/lib/badge-colors";
import { cn } from "@/lib/utils";
import { calculateQuorumProgress } from "@/lib/vote-utils";

export interface QuorumIndicatorProps {
  current: string;
  required: string;
  reached?: boolean;
}

export const QuorumIndicator = memo(function QuorumIndicator({
  current,
  required,
  reached,
}: QuorumIndicatorProps) {
  const { percentage, isReached } = calculateQuorumProgress(
    current,
    required,
    reached
  );
  const colors = isReached ? QUORUM_COLORS.reached : QUORUM_COLORS.pending;

  return (
    <div
      className="flex items-center gap-2"
      title={`Quorum: ${percentage.toFixed(0)}% of required votes`}
    >
      {/* Quorum label badge */}
      <div
        className={cn(
          "flex items-center justify-center w-5 h-5 rounded-md text-[10px] font-bold transition-all duration-300 ring-1",
          colors.bg,
          colors.text,
          colors.ring
        )}
      >
        {isReached ? <CheckIcon className="h-3 w-3" /> : "Q"}
      </div>

      {/* Progress bar container */}
      <div className="w-12 space-y-0.5">
        {/* Progress track */}
        <div
          className={cn(
            "h-1.5 rounded-full overflow-hidden",
            "bg-white/10 dark:bg-white/5"
          )}
        >
          {/* Progress fill with glow effect when reached */}
          <div
            className={cn(
              "h-full rounded-full transition-all duration-500 ease-out",
              colors.gradient
            )}
            style={{ width: `${percentage}%` }}
          />
        </div>

        {/* Percentage label */}
        <div
          className={cn(
            "text-[10px] font-semibold text-center transition-colors duration-300",
            colors.text
          )}
        >
          {percentage.toFixed(0)}%
        </div>
      </div>
    </div>
  );
});
