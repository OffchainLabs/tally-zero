"use client";

import Link from "next/link";
import { memo } from "react";

import { buildProposalPath } from "@/lib/proposal-url";
import {
  extractProposalTitle,
  truncateMiddle,
  truncateText,
} from "@/lib/text-utils";
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
  const abbreviatedProposalId = truncateMiddle(proposal.id, 6, 6);

  return (
    <Link
      href={buildProposalPath({
        proposalId: proposal.id,
        governorAddress: proposal.contractAddress,
        tab: defaultTab,
      })}
      className="block w-full text-left text-foreground hover:text-primary hover:underline transition-colors cursor-pointer"
      title="Click to view full description"
    >
      <span className="block truncate font-medium">{plainText}</span>
      <span className="mt-1 block truncate font-mono text-xs text-muted-foreground">
        ID: {abbreviatedProposalId}
      </span>
    </Link>
  );
}
