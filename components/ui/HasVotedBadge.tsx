"use client";

import { Check } from "lucide-react";
import { useAccount } from "wagmi";

import { Skeleton } from "@/components/ui/Skeleton";
import { useProposalHasVoted } from "@/hooks/use-proposal-has-voted";
import { cn } from "@/lib/utils";
import { ParsedProposal } from "@/types/proposal";

interface HasVotedBadgeProps {
  proposal: ParsedProposal;
  /** Size variant: "sm" for mobile cards, "default" for table cells */
  size?: "sm" | "default";
  /** Render a muted dash when no status is available (keeps table columns aligned) */
  showPlaceholder?: boolean;
  className?: string;
}

/**
 * Shows whether the connected wallet has voted on a proposal.
 * Renders nothing when no wallet is connected, unless showPlaceholder is set.
 */
export function HasVotedBadge({
  proposal,
  size = "default",
  showPlaceholder = false,
  className,
}: HasVotedBadgeProps) {
  const { isConnected } = useAccount();
  const { hasVoted, isLoadingHasVoted } = useProposalHasVoted({
    proposalId: proposal.id,
    governorAddress: proposal.contractAddress as `0x${string}`,
  });

  const textSize = size === "sm" ? "text-[10px]" : "text-xs";

  if (!isConnected || hasVoted === undefined) {
    if (isConnected && isLoadingHasVoted) {
      return <Skeleton className={cn("h-5 w-16", className)} />;
    }
    if (!showPlaceholder) return null;
    return (
      <span className={cn(textSize, "text-muted-foreground", className)}>
        –
      </span>
    );
  }

  if (!hasVoted) {
    return (
      <span className={cn(textSize, "text-muted-foreground", className)}>
        Not voted
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md font-medium backdrop-blur-md",
        size === "sm" ? "text-[10px] px-2 py-0.5" : "text-xs px-2.5 py-0.5",
        "bg-emerald-500/10 text-emerald-700 border border-emerald-300/40",
        "dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-400/30",
        className
      )}
    >
      <Check className={size === "sm" ? "h-2.5 w-2.5" : "h-3 w-3"} />
      Voted
    </span>
  );
}
