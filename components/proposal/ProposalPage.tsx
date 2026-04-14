"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo } from "react";

import VoteModel from "@/components/container/VoteModel";
import { Button } from "@/components/ui/Button";
import { GovernorBadge } from "@/components/ui/GovernorBadge";
import { Skeleton } from "@/components/ui/Skeleton";
import { proposalSchema } from "@/config/schema";
import { useProposalById } from "@/hooks/use-proposal-by-id";
import {
  buildGovernorId,
  buildProposalPath,
  normalizeProposalTab,
  parseGovernorId,
  type ProposalTab,
} from "@/lib/proposal-url";
import { mergeProposalData } from "@/lib/proposal-utils";
import { findStateByValue } from "@/lib/state-utils";
import { stripMarkdownAndHtml, truncateText } from "@/lib/text-utils";
import type { ParsedProposal } from "@/types/proposal";
import { ArrowLeft } from "lucide-react";

export function ProposalPage({
  proposalId,
  initialProposal = null,
}: {
  proposalId: string;
  initialProposal?: ParsedProposal | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const requestedGovId = searchParams.get("govId");
  const requestedTab = searchParams.get("tab");
  const governorAddress = useMemo(
    () => parseGovernorId(requestedGovId),
    [requestedGovId]
  );
  const activeTab = normalizeProposalTab(requestedTab) ?? "description";
  const shouldFetchLiveProposal = useMemo(() => {
    if (!initialProposal) return true;

    return (
      initialProposal.state === "Queued" || initialProposal.state === "Pending"
    );
  }, [initialProposal]);

  const {
    proposal: fetchedProposal,
    isLoading: isLiveLoading,
    error: liveError,
  } = useProposalById({
    proposalId,
    governorAddress,
    enabled: shouldFetchLiveProposal,
  });
  const proposal = useMemo(
    () => mergeProposalData(initialProposal, fetchedProposal),
    [initialProposal, fetchedProposal]
  );
  const isLoading = !proposal && isLiveLoading;
  const error = proposal ? null : liveError;
  const canonicalTab = useMemo(() => {
    if (!proposal) return activeTab;
    return activeTab === "vote" && proposal.state.toLowerCase() !== "active"
      ? "description"
      : activeTab;
  }, [activeTab, proposal]);

  useEffect(() => {
    if (!proposal) return;

    const canonicalGovId = buildGovernorId(proposal.contractAddress);
    const canonicalUrl = buildProposalPath({
      proposalId: proposal.id,
      governorAddress: proposal.contractAddress,
      tab: canonicalTab,
    });
    const isTabCanonical =
      canonicalTab === "description"
        ? requestedTab === null
        : requestedTab === canonicalTab;

    if (requestedGovId !== canonicalGovId || !isTabCanonical) {
      router.replace(canonicalUrl, { scroll: false });
    }
  }, [canonicalTab, proposal, requestedGovId, requestedTab, router]);

  const handleTabChange = useCallback(
    (tab: ProposalTab) => {
      if (!proposal) return;

      const nextUrl = buildProposalPath({
        proposalId: proposal.id,
        governorAddress: proposal.contractAddress,
        tab,
      });
      const currentQuery = searchParams.toString();
      const currentUrl = currentQuery
        ? `${pathname}?${currentQuery}`
        : pathname;

      if (nextUrl !== currentUrl) {
        router.replace(nextUrl, { scroll: false });
      }
    },
    [pathname, proposal, router, searchParams]
  );

  return (
    <div className="space-y-6 pb-8 pt-6 md:pb-12 md:pt-10 lg:py-16">
      <div className="container max-w-screen-xl space-y-6">
        <Button asChild variant="ghost" size="sm" className="w-fit">
          <Link href="/explore">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Explore
          </Link>
        </Button>

        {isLoading && <ProposalPageSkeleton />}

        {!isLoading && error && (
          <ProposalPageError
            title="Failed to load proposal"
            message={error.message}
          />
        )}

        {!isLoading && !error && !proposal && (
          <ProposalPageError
            title="Proposal not found"
            message={`Could not find proposal ${proposalId}.`}
          />
        )}

        {!isLoading && proposal && (
          <ProposalPageContent
            proposal={proposal}
            activeTab={canonicalTab}
            onTabChange={handleTabChange}
          />
        )}
      </div>
    </div>
  );
}

function ProposalPageContent({
  proposal,
  activeTab,
  onTabChange,
}: {
  proposal: NonNullable<ReturnType<typeof useProposalById>["proposal"]>;
  activeTab: ProposalTab;
  onTabChange: (tab: ProposalTab) => void;
}) {
  const parsedProposal = proposalSchema.safeParse(proposal);

  if (!parsedProposal.success) {
    return (
      <ProposalPageError
        title="Invalid proposal data"
        message="The proposal data could not be parsed."
      />
    );
  }

  const stateValue = findStateByValue(proposal.state);
  if (!stateValue) {
    return (
      <ProposalPageError
        title="Unknown proposal state"
        message="The proposal state could not be recognized."
      />
    );
  }

  const title = truncateText(stripMarkdownAndHtml(proposal.description), 140);

  return (
    <div className="space-y-4">
      <div className="glass rounded-2xl border border-white/40 dark:border-white/10 p-4 sm:p-6 shadow-lg shadow-black/5">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {proposal.governorName && (
              <GovernorBadge governorName={proposal.governorName} />
            )}
            <code className="rounded-md bg-black/5 px-2 py-1 text-[11px] text-muted-foreground dark:bg-white/5">
              {proposal.id}
            </code>
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            {title}
          </h1>
        </div>
      </div>

      <VoteModel
        proposal={parsedProposal.data}
        stateValue={stateValue}
        isDesktop={true}
        variant="page"
        defaultTab={activeTab}
        onTabChange={onTabChange}
      />
    </div>
  );
}

function ProposalPageSkeleton() {
  return (
    <div className="space-y-4">
      <div className="glass rounded-2xl border border-white/40 dark:border-white/10 p-4 sm:p-6 shadow-lg shadow-black/5">
        <div className="space-y-3">
          <div className="flex gap-2">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-6 w-64" />
          </div>
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-3/4" />
        </div>
      </div>

      <div className="glass rounded-2xl border border-white/40 dark:border-white/10 p-4 sm:p-6 shadow-lg shadow-black/5">
        <div className="space-y-4">
          <Skeleton className="h-10 w-full max-w-md" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    </div>
  );
}

function ProposalPageError({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <div className="glass rounded-2xl border border-red-200/50 bg-red-50/60 p-6 shadow-lg shadow-red-500/5 dark:border-red-900/40 dark:bg-red-950/20">
      <div className="space-y-2">
        <h1 className="text-lg font-semibold text-red-700 dark:text-red-300">
          {title}
        </h1>
        <p className="text-sm text-red-600/80 dark:text-red-400/80">
          {message}
        </p>
      </div>
    </div>
  );
}
