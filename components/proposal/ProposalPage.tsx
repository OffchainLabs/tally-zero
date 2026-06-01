"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import VoteModel from "@/components/container/VoteModel";
import { type CalldataOverrides } from "@/components/payload";
import { ProposalCancelCard } from "@/components/proposal/ProposalCancelCard";
import { ProposalPageError } from "@/components/proposal/ProposalPageError";
import { ProposalPageSkeleton } from "@/components/proposal/ProposalPageSkeleton";
import { ProposalVoteCard } from "@/components/proposal/ProposalVoteCard";
import { ProposalVoteSummaryCard } from "@/components/proposal/ProposalVoteSummaryCard";
import { Button } from "@/components/ui/Button";
import { GovernorBadge } from "@/components/ui/GovernorBadge";
import { proposalSchema } from "@/config/schema";
import { useProposalById } from "@/hooks/use-proposal-by-id";
import {
  buildGovernorId,
  buildProposalPath,
  normalizeProposalTab,
  parseGovernorId,
  type ProposalTab,
} from "@/lib/proposal-url";
import {
  isIncompleteProposalState,
  mergeProposalData,
} from "@/lib/proposal-utils";
import { findStateByValue } from "@/lib/state-utils";
import {
  extractProposalTitle,
  truncateMiddle,
  truncateText,
} from "@/lib/text-utils";
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
  const searchParams = useSearchParams();

  const requestedGovId = searchParams.get("govId");
  const governorAddress = useMemo(
    () => parseGovernorId(requestedGovId),
    [requestedGovId]
  );
  const [activeTab, setActiveTab] = useState<ProposalTab>(() => {
    if (typeof window === "undefined") return "description";
    const params = new URLSearchParams(window.location.search);
    return normalizeProposalTab(params.get("tab")) ?? "description";
  });

  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      const next = normalizeProposalTab(params.get("tab")) ?? "description";
      setActiveTab(next);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);
  const stableInitialProposal = useMemo(() => {
    if (!initialProposal) return null;

    return isIncompleteProposalState(initialProposal.state)
      ? null
      : initialProposal;
  }, [initialProposal]);
  const shouldFetchLiveProposal = stableInitialProposal === null;

  const {
    proposal: fetchedProposal,
    isLoading: isLiveLoading,
    error: liveError,
    refetch: refetchLiveProposal,
  } = useProposalById({
    proposalId,
    governorAddress,
    enabled: shouldFetchLiveProposal,
  });
  const proposal = useMemo(
    () => mergeProposalData(stableInitialProposal, fetchedProposal),
    [stableInitialProposal, fetchedProposal]
  );
  const isLoading =
    !proposal && (isLiveLoading || (shouldFetchLiveProposal && !liveError));
  const error = proposal ? null : liveError;

  useEffect(() => {
    if (!proposal || typeof window === "undefined") return;

    const liveParams = new URLSearchParams(window.location.search);
    const liveGovId = liveParams.get("govId");
    const liveTabRaw = liveParams.get("tab");
    const liveActiveTab = normalizeProposalTab(liveTabRaw) ?? "description";

    const canonicalGovId = buildGovernorId(proposal.contractAddress);
    const canonicalUrl = buildProposalPath({
      proposalId: proposal.id,
      governorAddress: proposal.contractAddress,
      tab: liveActiveTab,
    });
    const isTabCanonical =
      liveActiveTab === "description"
        ? liveTabRaw === null
        : liveTabRaw === liveActiveTab;
    const isGovIdCanonical =
      liveGovId?.toLowerCase() === canonicalGovId.toLowerCase();

    if (!isGovIdCanonical || !isTabCanonical) {
      window.history.replaceState(null, "", canonicalUrl);
      router.replace(canonicalUrl, { scroll: false });
    }
  }, [proposal, router]);

  const handleTabChange = useCallback(
    (tab: ProposalTab) => {
      setActiveTab(tab);
      if (!proposal) return;

      const nextUrl = buildProposalPath({
        proposalId: proposal.id,
        governorAddress: proposal.contractAddress,
        tab,
      });

      window.history.replaceState(null, "", nextUrl);
      router.replace(nextUrl, { scroll: false });
    },
    [proposal, router]
  );

  return (
    <div className="space-y-6 pb-8 pt-6 md:pb-12 md:pt-10 lg:py-16">
      <div className="container max-w-screen-xl space-y-6">
        <Button asChild variant="ghost" size="sm" className="w-fit">
          <Link href="/proposals">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Proposals
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
            activeTab={activeTab}
            onTabChange={handleTabChange}
            onProposalCanceled={refetchLiveProposal}
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
  onProposalCanceled,
}: {
  proposal: NonNullable<ReturnType<typeof useProposalById>["proposal"]>;
  activeTab: ProposalTab;
  onTabChange: (tab: ProposalTab) => void;
  onProposalCanceled: () => void;
}) {
  const [calldataOverrides, setCalldataOverrides] = useState<CalldataOverrides>(
    {}
  );
  const [showFullId, setShowFullId] = useState(false);

  const handleCalldataOverrideChange = useCallback(
    (index: number, newCalldata: string | undefined) => {
      setCalldataOverrides((prev) => {
        if (newCalldata === undefined) {
          const next = { ...prev };
          delete next[index];
          return next;
        }
        return { ...prev, [index]: newCalldata };
      });
    },
    []
  );

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

  const title = truncateText(extractProposalTitle(proposal.description), 140);
  const hasCalldataOverrides = Object.keys(calldataOverrides).length > 0;

  return (
    <div className="space-y-4">
      <div className="glass rounded-2xl border border-white/40 dark:border-white/10 p-4 sm:p-6 shadow-lg shadow-black/5">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {proposal.governorName && (
              <GovernorBadge governorName={proposal.governorName} />
            )}
            <code className="rounded-md bg-black/5 px-2 py-1 text-[11px] text-muted-foreground dark:bg-white/5 break-all">
              {showFullId ? proposal.id : truncateMiddle(proposal.id)}
            </code>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[11px] text-muted-foreground"
              onClick={() => setShowFullId((prev) => !prev)}
            >
              {showFullId ? "Show less" : "Show full ID"}
            </Button>
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            {title}
          </h1>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <div className="space-y-6">
          <ProposalVoteSummaryCard
            governorAddress={proposal.contractAddress}
            votes={proposal.votes}
          />
          <ProposalCancelCard
            proposal={parsedProposal.data}
            onCanceled={onProposalCanceled}
          />
          <ProposalVoteCard
            proposal={parsedProposal.data}
            hasCalldataOverrides={hasCalldataOverrides}
          />
        </div>

        <VoteModel
          proposal={parsedProposal.data}
          stateValue={stateValue}
          isDesktop={true}
          variant="page"
          defaultTab={activeTab}
          onTabChange={onTabChange}
          className="md:col-span-2"
          calldataOverrides={calldataOverrides}
          onCalldataOverrideChange={handleCalldataOverrideChange}
        />
      </div>
    </div>
  );
}
