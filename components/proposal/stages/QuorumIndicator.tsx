"use client";

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
      className="w-24 space-y-1"
      title={`Quorum: ${percentage.toFixed(0)}% of required votes`}
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

      {/* Percentage label */}
      <div
        className={cn(
          "text-[10px] font-medium tabular-nums transition-colors duration-300",
          colors.text
        )}
      >
        {percentage.toFixed(0)}%
      </div>
    </div>
  );
});
