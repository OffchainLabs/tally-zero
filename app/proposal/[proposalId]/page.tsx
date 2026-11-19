import type { Metadata } from "next";

import { ProposalPage } from "@/components/proposal/ProposalPage";
import { isIncompleteProposalState } from "@/lib/proposal-utils";
import { buildProposalMetadata } from "@/lib/seo";
import {
  getStaticProposalById,
  listStaticProposalIds,
} from "@/lib/static-proposal-data";

type ProposalRouteParams = {
  proposalId: string;
};

type ProposalRoutePageProps = {
  params: Promise<ProposalRouteParams>;
};

/**
 * Title and description come from the proposal body in the bundled cache, so
 * each proposal page is indexed under its own name instead of a shared
 * "Proposal" title. Proposals not in the cache keep the generic copy.
 */
export async function generateMetadata(
  props: ProposalRoutePageProps
): Promise<Metadata> {
  const { proposalId } = await props.params;
  return buildProposalMetadata(proposalId, getStaticProposalById(proposalId));
}

export async function generateStaticParams(): Promise<ProposalRouteParams[]> {
  const proposalIds = await listStaticProposalIds();
  return proposalIds.map((proposalId) => ({ proposalId }));
}

export default async function ProposalRoutePage(props: ProposalRoutePageProps) {
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
