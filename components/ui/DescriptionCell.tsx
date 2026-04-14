"use client";

import { memo, useCallback } from "react";

import { useDeepLink } from "@/context/DeepLinkContext";
import { extractProposalTitle, truncateText } from "@/lib/text-utils";
import { ParsedProposal } from "@/types/proposal";

export const DescriptionCell = memo(function DescriptionCell({
  mdxContent,
}: {
  mdxContent: string;
}) {
  const plainText = truncateText(extractProposalTitle(mdxContent));

  return (
    <span className="block truncate font-medium text-foreground">
      {plainText}
    </span>
  );
});

/**
 * Clickable description cell that navigates to the proposal page.
 */
export function ClickableDescriptionCell({
  proposal,
  defaultTab = "description",
}: {
  proposal: ParsedProposal;
  defaultTab?: "description" | "payload" | "stages" | "vote";
}) {
  const { openProposal } = useDeepLink();

  const handleClick = useCallback(() => {
    openProposal(proposal.id, proposal.contractAddress, defaultTab);
  }, [proposal.id, proposal.contractAddress, defaultTab, openProposal]);

  const plainText = truncateText(extractProposalTitle(proposal.description));

  return (
    <button
      onClick={handleClick}
      className="block w-full truncate font-medium text-foreground text-left hover:text-primary hover:underline transition-colors cursor-pointer"
      title="Click to view full description"
    >
      {plainText}
    </button>
  );
}
