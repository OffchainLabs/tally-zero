"use client";

import { useEffect, useMemo, useState } from "react";

import { ProposalDetail } from "@/components/proposal/ProposalDetail";
import { GovernorBadge } from "@/components/ui/GovernorBadge";
import { Skeleton } from "@/components/ui/Skeleton";
import { StatusBadgeGlass } from "@/components/ui/StatusBadgeGlass";
import { proposalSchema } from "@/config/schema";
import { useProposalById } from "@/hooks/use-proposal-by-id";
import { extractProposalsFromBundledCache } from "@/lib/bundled-cache-loader";
import { stripMarkdownAndHtml, truncateMiddle } from "@/lib/text-utils";
import type { ParsedProposal } from "@/types/proposal";

interface ProposalPageClientProps {
  proposalId: string;
}

export default function ProposalPageClient({
  proposalId,
}: ProposalPageClientProps) {
  const bundledProposal = useBundledProposal(proposalId);

  const {
    proposal: fetchedProposal,
    isLoading,
    error,
  } = useProposalById({
    proposalId,
    enabled: !bundledProposal,
  });

  const proposal = bundledProposal ?? fetchedProposal;

  const parsed = useMemo(() => {
    if (!proposal) return null;
    const result = proposalSchema.safeParse(proposal);
    return result.success ? result.data : null;
  }, [proposal]);

  if (!proposal && isLoading) {
    return <ProposalPageSkeleton />;
  }

  if (!proposal && error) {
    return <ProposalErrorState message={error.message} />;
  }

  if (!proposal || !parsed) {
    return <ProposalNotFoundState proposalId={proposalId} />;
  }

  const title =
    deriveTitle(proposal.description) ||
    `Proposal ${truncateMiddle(proposalId, 6, 4)}`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadgeGlass state={proposal.state} />
          {proposal.governorName && (
            <GovernorBadge governorName={proposal.governorName} />
          )}
          <span className="text-xs text-muted-foreground font-mono">
            ID {truncateMiddle(proposalId, 6, 4)}
          </span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl break-words">
          {title}
        </h1>
      </div>

      <div className="glass rounded-2xl p-4 flex flex-col min-h-[60vh]">
        <ProposalDetail
          proposal={parsed}
          defaultTab="description"
          maxHeight="max-h-[70vh]"
        />
      </div>
    </div>
  );
}

/**
 * Look the proposal up in the bundled gov-tracker cache so the standalone
 * page can render without waiting on (or needing) an RPC round-trip.
 */
function useBundledProposal(proposalId: string): ParsedProposal | null {
  const [proposal, setProposal] = useState<ParsedProposal | null>(null);

  useEffect(() => {
    let cancelled = false;
    extractProposalsFromBundledCache()
      .then(({ proposals }) => {
        if (cancelled) return;
        const match = proposals.find((p) => p.id === proposalId) ?? null;
        setProposal(match);
      })
      .catch(() => {
        if (cancelled) return;
        setProposal(null);
      });
    return () => {
      cancelled = true;
    };
  }, [proposalId]);

  return proposal;
}

function deriveTitle(description: string): string | null {
  if (!description) return null;
  const firstLine = description
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  if (!firstLine) return null;
  const heading = firstLine.replace(/^#+\s*/, "");
  const stripped = stripMarkdownAndHtml(heading).trim();
  if (!stripped) return null;
  return stripped.length > 160 ? `${stripped.slice(0, 157)}…` : stripped;
}

function ProposalPageSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <div className="flex gap-2">
          <Skeleton className="h-6 w-20" />
          <Skeleton className="h-6 w-28" />
        </div>
        <Skeleton className="h-10 w-3/4" />
      </div>
      <Skeleton className="h-[60vh] w-full rounded-2xl" />
    </div>
  );
}

function ProposalErrorState({ message }: { message: string }) {
  return (
    <div className="glass rounded-2xl p-6 border-red-500/30">
      <h2 className="text-lg font-semibold mb-2">Failed to load proposal</h2>
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

function ProposalNotFoundState({ proposalId }: { proposalId: string }) {
  return (
    <div className="glass rounded-2xl p-6 border-yellow-500/30">
      <h2 className="text-lg font-semibold mb-2">Proposal not found</h2>
      <p className="text-sm text-muted-foreground">
        Could not find a proposal with ID{" "}
        <code className="px-1 py-0.5 bg-muted rounded text-xs font-mono">
          {truncateMiddle(proposalId, 8, 6)}
        </code>{" "}
        in the Core or Treasury Governor.
      </p>
    </div>
  );
}
