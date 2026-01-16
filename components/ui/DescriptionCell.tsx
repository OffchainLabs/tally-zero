"use client";

import { memo, useCallback } from "react";

import { useDeepLink } from "@/context/DeepLinkContext";
import { stripMarkdownAndHtml, truncateText } from "@/lib/text-utils";
import { ParsedProposal } from "@/types/proposal";

export const DescriptionCell = memo(function DescriptionCell({
  mdxContent,
}: {
  mdxContent: string;
}) {
  const plainText = truncateText(stripMarkdownAndHtml(mdxContent));

  return (
    <span className="block truncate font-medium text-foreground">
      {plainText}
    </span>
  );
});

/**
 * Clickable description cell that opens the proposal in DeepLinkHandler.
 * Only updates the URL - the DeepLinkHandler component renders the modal.
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
    openProposal(proposal.id, defaultTab);
  }, [proposal.id, defaultTab, openProposal]);

  const plainText = truncateText(stripMarkdownAndHtml(proposal.description));

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
