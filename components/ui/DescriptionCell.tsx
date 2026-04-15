"use client";

import Link from "next/link";
import { memo } from "react";

import { buildProposalPath } from "@/lib/proposal-url";
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
  const plainText = truncateText(extractProposalTitle(proposal.description));

  return (
    <Link
      href={buildProposalPath({
        proposalId: proposal.id,
        governorAddress: proposal.contractAddress,
        tab: defaultTab,
      })}
      className="block w-full truncate font-medium text-foreground text-left hover:text-primary hover:underline transition-colors cursor-pointer"
      title="Click to view full description"
    >
      {plainText}
    </Link>
  );
}
