"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo } from "react";

import VoteModel from "@/components/container/VoteModel";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { GovernorBadge } from "@/components/ui/GovernorBadge";
import { Skeleton } from "@/components/ui/Skeleton";
import { getGovernorByAddress } from "@/config/governors";
import { proposalSchema } from "@/config/schema";
import { useProposalById } from "@/hooks/use-proposal-by-id";
import { VOTE_COLORS } from "@/lib/badge-colors";
import { formatVotingPower } from "@/lib/format-utils";
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
import { extractProposalTitle, truncateText } from "@/lib/text-utils";
import { cn } from "@/lib/utils";
import {
  calculatePreciseQuorumProgress,
  calculateVoteDistribution,
} from "@/lib/vote-utils";
import type { ParsedProposal, ProposalVotes } from "@/types/proposal";
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

  const title = truncateText(extractProposalTitle(proposal.description), 140);

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

      <div className="grid md:grid-cols-3 gap-6">
        <ProposalVoteSummaryCard
          governorAddress={proposal.contractAddress}
          votes={proposal.votes}
        />

        <VoteModel
          proposal={parsedProposal.data}
          stateValue={stateValue}
          isDesktop={true}
          variant="page"
          defaultTab={activeTab}
          onTabChange={onTabChange}
          className="md:col-span-2"
        />
      </div>
    </div>
  );
}

function ProposalVoteSummaryCard({
  governorAddress,
  votes,
}: {
  governorAddress: string;
  votes?: ProposalVotes | null;
}) {
  const governorConfig = getGovernorByAddress(governorAddress);
  const forVotes = votes?.forVotes ?? "0";
  const againstVotes = votes?.againstVotes ?? "0";
  const abstainVotes = votes?.abstainVotes ?? "0";
  const quorum = votes?.quorum;
  const { forPct, againstPct, abstainPct, hasVotes } =
    calculateVoteDistribution(forVotes, againstVotes, abstainVotes);
  const forQuorumProgress = quorum
    ? calculatePreciseQuorumProgress(forVotes, quorum)
    : null;
  const proposalTypeLabel =
    governorConfig?.type === "core"
      ? "Constitutional Quorum"
      : governorConfig?.type === "treasury"
        ? "Non-Constitutional Quorum"
        : "Proposal Quorum";

  const voteLegendItems = [
    {
      label: "For",
      value: forVotes,
      percentage: forPct,
      colors: VOTE_COLORS.for,
    },
    {
      label: "Against",
      value: againstVotes,
      percentage: againstPct,
      colors: VOTE_COLORS.against,
    },
    {
      label: "Abstain",
      value: abstainVotes,
      percentage: abstainPct,
      colors: VOTE_COLORS.abstain,
    },
  ] as const;

  return (
    <Card
      variant="glass"
      className="rounded-2xl border border-white/40 shadow-lg shadow-black/5 dark:border-white/10 max-h-fit"
    >
      <CardContent className="p-4 md:p-6">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">
                {proposalTypeLabel}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {governorConfig?.name ?? "Unknown governor"}
              </p>
            </div>
            {quorum && (
              <div className="text-right">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  For / Quorum
                </p>
                <p className="text-sm font-semibold tabular-nums text-foreground">
                  {forQuorumProgress?.percentage.toFixed(1) ?? "0.0"}%
                </p>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
            {voteLegendItems.map(({ label, value, percentage, colors }) => (
              <div key={label} className="flex items-center gap-1.5">
                <span className={cn("h-2 w-2 rounded-full", colors.dot)} />
                <span className={cn("font-medium", colors.text)}>{label}</span>
                <span className="tabular-nums text-foreground">
                  {formatVotingPower(value)}
                </span>
                <span className="tabular-nums text-muted-foreground">
                  {percentage.toFixed(1)}%
                </span>
              </div>
            ))}
          </div>

          <div className="flex h-3 overflow-hidden rounded-full bg-black/5 dark:bg-white/10">
            {forPct > 0 && (
              <div
                className={cn(VOTE_COLORS.for.gradient, "transition-all")}
                style={{ width: `${forPct}%` }}
              />
            )}
            {againstPct > 0 && (
              <div
                className={cn(VOTE_COLORS.against.gradient, "transition-all")}
                style={{ width: `${againstPct}%` }}
              />
            )}
            {abstainPct > 0 && (
              <div
                className={cn(VOTE_COLORS.abstain.gradient, "transition-all")}
                style={{ width: `${abstainPct}%` }}
              />
            )}
          </div>

          {quorum ? (
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="text-muted-foreground">
                  {formatVotingPower(forVotes)} / {formatVotingPower(quorum)}{" "}
                  ARB
                </span>
                <span className="text-muted-foreground">
                  Quorum {governorConfig?.quorum ?? "N/A"}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-black/5 dark:bg-white/10">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-500",
                    VOTE_COLORS.for.gradient
                  )}
                  style={{
                    width: `${forQuorumProgress?.progressPercentage ?? 0}%`,
                  }}
                />
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Quorum data is not available for this proposal yet.
            </p>
          )}

          {!hasVotes && (
            <p className="text-xs text-muted-foreground">
              No votes recorded yet.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
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
