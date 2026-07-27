"use client";

import { useQuery } from "@tanstack/react-query";

import { useInView } from "@/hooks/use-in-view";
import { useRpcSettings } from "@/hooks/use-rpc-settings";
import { fetchProposalQuorum } from "@/lib/governor-search";
import { sumVoteCounts } from "@/lib/vote-utils";
import type { ParsedProposal } from "@/types/proposal";
import { QuorumIndicator } from "@components/proposal/stages/QuorumIndicator";

/**
 * Quorum cell for the proposals table.
 *
 * The indexer feed carries no quorum, so we resolve it per row:
 * - Executed proposals necessarily reached quorum, so show a full 100% bar
 *   without any network call.
 * - Every other status fetches `quorum(snapshotBlock)` from the governor via
 *   RPC, but only once the row scrolls into view (and only if a live refresh
 *   has not already filled it). Results are cached for the session by
 *   TanStack Query so each proposal is fetched at most once.
 */
export function QuorumCell({ proposal }: { proposal: ParsedProposal }) {
  const votes = proposal.votes;
  const isExecuted = proposal.state === "Executed";
  const snapshotBlock = proposal.startBlock;
  const hasSnapshot = Boolean(snapshotBlock) && snapshotBlock !== "0";
  const existingQuorum = votes?.quorum;

  const { l2Rpc } = useRpcSettings();
  const [ref, inView] = useInView<HTMLDivElement>({ rootMargin: "100px" });

  // Only reach for RPC when there is something to fetch and the row is visible.
  const needsFetch = !isExecuted && !existingQuorum && hasSnapshot;

  const { data: fetchedQuorum, isLoading } = useQuery({
    queryKey: [
      "proposal-quorum",
      proposal.contractAddress.toLowerCase(),
      proposal.id,
      snapshotBlock,
      l2Rpc,
    ],
    queryFn: () =>
      fetchProposalQuorum(l2Rpc, proposal.contractAddress, snapshotBlock),
    enabled: needsFetch && inView,
    staleTime: Infinity,
    gcTime: 30 * 60 * 1000,
    retry: 1,
  });

  // Executed: reached by definition, render a full bar with no fetch.
  if (isExecuted) {
    return (
      <div ref={ref}>
        <QuorumIndicator current="1" required="1" reached />
      </div>
    );
  }

  const current = votes
    ? sumVoteCounts(votes.forVotes, votes.abstainVotes)
    : "0";
  const quorum = existingQuorum ?? fetchedQuorum;

  if (quorum) {
    return (
      <div ref={ref}>
        <QuorumIndicator current={current} required={quorum} />
      </div>
    );
  }

  // Awaiting an in-view RPC fetch: skeleton track (keeps column width stable).
  if (needsFetch && (isLoading || !inView)) {
    return (
      <div ref={ref} className="w-24">
        <div className="h-1.5 w-full animate-pulse rounded-full bg-white/10" />
      </div>
    );
  }

  // No snapshot block / fetch failed: nothing to show.
  return (
    <div ref={ref}>
      <span className="text-muted-foreground text-xs">-</span>
    </div>
  );
}
