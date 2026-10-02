"use client";

import { Suspense } from "react";

import { ProposalsTabs } from "@/components/container/ProposalsTabs";
import Search from "@/components/container/Search";
import SearchSkeleton from "@/components/container/SearchSkeleton";

/**
 * Top-level proposals view: the shared "Proposals / My Drafts" nav over the
 * live proposals table.
 */
export function ProposalsView() {
  return (
    <ProposalsTabs>
      <Suspense fallback={<SearchSkeleton />}>
        <Search />
      </Suspense>
    </ProposalsTabs>
  );
}
