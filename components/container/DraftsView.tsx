"use client";

import MyDraftsList from "@/components/container/MyDraftsList";
import { ProposalsTabs } from "@/components/container/ProposalsTabs";
import { useSiwe } from "@/hooks/use-siwe";

/**
 * Top-level drafts view: the shared "Proposals / My Drafts" nav over the
 * signed-in user's drafts. The page itself is a server component, so the
 * session read that gates New Proposal lives here.
 */
export function DraftsView() {
  const { isSignedIn } = useSiwe();
  return (
    <ProposalsTabs active="drafts" showNewProposal={isSignedIn}>
      <MyDraftsList />
    </ProposalsTabs>
  );
}
