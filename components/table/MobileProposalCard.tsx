"use client";

import { memo, useCallback } from "react";

import { VoteDistributionBarCompact } from "@/components/proposal/stages/VoteDistributionBarCompact";
import { GovernorBadge } from "@/components/ui/GovernorBadge";
import { StatusBadgeGlass } from "@/components/ui/StatusBadgeGlass";
import { useDeepLink } from "@/context/DeepLinkContext";
import { stripMarkdownAndHtml, truncateText } from "@/lib/text-utils";
import { cn } from "@/lib/utils";
import { ParsedProposal } from "@/types/proposal";
import { ChevronRight } from "lucide-react";

interface MobileProposalCardProps {
  proposal: ParsedProposal;
}

/**
 * Mobile proposal card - opens proposal via DeepLinkHandler.
 */
export const MobileProposalCard = memo(function MobileProposalCard({
  proposal,
}: MobileProposalCardProps) {
  const { openProposal } = useDeepLink();
  const plainText = truncateText(
    stripMarkdownAndHtml(proposal.description),
    80
  );

  const handleClick = useCallback(() => {
    openProposal(proposal.id);
  }, [proposal.id, openProposal]);

  return (
    <button
      onClick={handleClick}
      className={cn(
        "w-full text-left p-4 rounded-xl min-h-[88px]",
        "glass-subtle",
        "hover:bg-white/40 dark:hover:bg-white/10",
        "hover:shadow-lg hover:shadow-primary/5",
        "transition-all duration-200",
        "active:scale-[0.98] touch-manipulation"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm leading-snug line-clamp-2">
            {plainText}
          </p>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <StatusBadgeGlass state={proposal.state} />
            {proposal.governorName && (
              <GovernorBadge governorName={proposal.governorName} size="sm" />
            )}
          </div>
          {proposal.votes && (
            <div className="mt-2">
              <VoteDistributionBarCompact votes={proposal.votes} />
            </div>
          )}
        </div>
        <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-1" />
      </div>
    </button>
  );
});

interface MobileProposalListProps {
  proposals: ParsedProposal[];
}

export const MobileProposalList = memo(function MobileProposalList({
  proposals,
}: MobileProposalListProps) {
  if (proposals.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No proposals found
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {proposals.map((proposal) => (
        <MobileProposalCard key={proposal.id} proposal={proposal} />
      ))}
    </div>
  );
});
