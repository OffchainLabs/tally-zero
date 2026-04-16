import { memo } from "react";

import { VOTE_COLORS } from "@/lib/badge-colors";
import { formatVotingPower } from "@/lib/format-utils";
import { cn } from "@/lib/utils";
import { ProposalVotes } from "@/types/proposal";

interface VoteDisplayProps {
  votes?: ProposalVotes | null;
  className?: string;
}

export const VoteDisplay = memo(function VoteDisplay({
  votes,
  className,
}: VoteDisplayProps) {
  if (!votes || !votes.forVotes || !votes.againstVotes || !votes.abstainVotes) {
    return (
      <div
        className={cn(
          "glass-subtle backdrop-blur rounded-xl p-4 text-sm text-muted-foreground transition-all duration-200",
          className
        )}
      >
        No vote data
      </div>
    );
  }

  const formatQuorum = (value: string | undefined) => {
    if (!value || value === "0") return "N/A";
    return formatVotingPower(value);
  };

  return (
    <div
      className={cn(
        "glass-subtle backdrop-blur rounded-xl p-4 transition-all duration-200",
        className
      )}
    >
      <div className="flex flex-col gap-2 text-sm">
        <div className="flex items-center justify-between gap-4">
          <span className={cn(VOTE_COLORS.for.text, "font-medium")}>For</span>
          <span className={cn(VOTE_COLORS.for.text, "tabular-nums")}>
            {formatVotingPower(votes.forVotes)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className={cn(VOTE_COLORS.against.text, "font-medium")}>
            Against
          </span>
          <span className={cn(VOTE_COLORS.against.text, "tabular-nums")}>
            {formatVotingPower(votes.againstVotes)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className={cn(VOTE_COLORS.abstain.text, "font-medium")}>
            Abstain
          </span>
          <span className="text-muted-foreground tabular-nums">
            {formatVotingPower(votes.abstainVotes)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4 pt-2 mt-1 border-t border-[var(--glass-border)]">
          <span className="text-muted-foreground font-medium">Quorum</span>
          <span className="tabular-nums">{formatQuorum(votes.quorum)}</span>
        </div>
      </div>
    </div>
  );
});
