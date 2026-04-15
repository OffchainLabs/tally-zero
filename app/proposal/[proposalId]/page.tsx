import type { BundledCache } from "@gzeoneth/gov-tracker";
import { extractProposals } from "@gzeoneth/gov-tracker";
import type { Metadata } from "next";

import { ProposalPage } from "@/components/proposal/ProposalPage";
import { isIncompleteProposalState } from "@/lib/proposal-utils";
import { getStaticProposalById } from "@/lib/static-proposal-data";

type ProposalRouteParams = Awaited<
  PageProps<"/proposal/[proposalId]">["params"]
>;

export const metadata: Metadata = {
  title: "Proposal",
};

export function generateStaticParams(): ProposalRouteParams[] {
  const proposalIds = new Set<string>();

  try {
    const cache =
      require("@gzeoneth/gov-tracker/bundled-cache.json") as BundledCache;

    for (const proposal of extractProposals(cache)) {
      proposalIds.add(proposal.proposalId);
    }
  } catch {
    // bundled cache not available at build time
  }

  return Array.from(proposalIds).map((proposalId) => ({ proposalId }));
}

export default async function ProposalRoutePage(
  props: PageProps<"/proposal/[proposalId]">
) {
  const { proposalId } = await props.params;
  const staticProposal = getStaticProposalById(proposalId);
  const initialProposal =
    staticProposal && !isIncompleteProposalState(staticProposal.state)
      ? staticProposal
      : null;

  return (
    <ProposalPage proposalId={proposalId} initialProposal={initialProposal} />
  );
}
