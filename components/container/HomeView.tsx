"use client";

import { Suspense, useState } from "react";

import { GovernanceStatCards } from "@/components/container/GovernanceStatCards";
import { ProposalsTabs } from "@/components/container/ProposalsTabs";
import Search from "@/components/container/Search";
import SearchSkeleton from "@/components/container/SearchSkeleton";

export interface HomeViewProps {
  /**
   * The page banner, injected by the server page so it stays a server
   * component while sharing a grid row with the client-owned stat cards.
   */
  banner: React.ReactNode;
}

/**
 * Home page body: the frame's banner and stat cards over the shared "Proposals
 * / My Drafts" nav and the proposals table. Owns the proposal count so the card
 * reuses the table's existing search result rather than fetching the proposals
 * index a second time.
 */
export function HomeView({ banner }: HomeViewProps) {
  const [proposalCount, setProposalCount] = useState<number | null>(null);

  return (
    <div className="flex flex-col gap-4">
      {/* Banner and stats sit side by side from lg up so the header stays
          compact and the proposals table is visible without scrolling. */}
      <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        {banner}
        <GovernanceStatCards proposalCount={proposalCount} />
      </div>
      <ProposalsTabs>
        <Suspense fallback={<SearchSkeleton />}>
          <Search onProposalCountChange={setProposalCount} />
        </Suspense>
      </ProposalsTabs>
    </div>
  );
}
