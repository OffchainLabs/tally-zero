"use client";

import { Suspense, useState } from "react";

import { GovernanceStatCards } from "@/components/container/GovernanceStatCards";
import { ProposalsTabs } from "@/components/container/ProposalsTabs";
import Search from "@/components/container/Search";
import SearchSkeleton from "@/components/container/SearchSkeleton";

/**
 * Home page body: the frame's stat cards over the shared "Proposals / My
 * Drafts" nav and the proposals table. Owns the proposal count so the card
 * reuses the table's existing search result rather than fetching the proposals
 * index a second time.
 */
export function HomeView() {
  const [proposalCount, setProposalCount] = useState<number | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <GovernanceStatCards proposalCount={proposalCount} />
      <ProposalsTabs>
        <Suspense fallback={<SearchSkeleton />}>
          <Search onProposalCountChange={setProposalCount} />
        </Suspense>
      </ProposalsTabs>
    </div>
  );
}
