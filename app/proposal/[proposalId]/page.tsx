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
  title: "Proposal | Arbitrum Governance",
  description: "View an ArbitrumDAO proposal, its payload, and lifecycle.",
};

export async function generateStaticParams(): Promise<ProposalRouteParams[]> {
  const imported = await import("@gzeoneth/gov-tracker/bundled-cache.json");
  const cache = imported.default as BundledCache;
  const proposalIds = new Set<string>();

  for (const proposal of extractProposals(cache)) {
    if (proposal.proposalId) {
      proposalIds.add(proposal.proposalId);
    }
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
