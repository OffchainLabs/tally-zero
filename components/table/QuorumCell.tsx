"use client";

import { useQuery } from "@tanstack/react-query";

import { useInView } from "@/hooks/use-in-view";
import { useRpcSettings } from "@/hooks/use-rpc-settings";
import { fetchProposalQuorum } from "@/lib/governor-search";
import { sumVoteCounts } from "@/lib/vote-utils";
import type { ParsedProposal } from "@/types/proposal";
import { QuorumIndicator } from "@components/proposal/stages/QuorumIndicator";

/**
 * The quorum we were handed, or undefined when it is not a real requirement.
 *
 * The live vote-update patch in `use-multi-governor-search` writes a `"0"`
 * sentinel when it has no quorum to carry over, and `"0"` is a truthy string:
 * read as a requirement it renders a 0% bar and, on an executed row, a 0% bar
 * coloured as reached. It also suppresses the RPC fetch that would supply the
 * real number.
 */
function knownQuorum(value: string | undefined): string | undefined {
  return value && value !== "0" ? value : undefined;
}

/**
 * Quorum cell for the proposals table.
 *
 * The indexer feed carries no quorum, so we resolve it per row:
 * - Executed proposals necessarily reached quorum, so show a full 100% bar
 *   without any network call. When a live refresh has already supplied the
 *   quorum, the real counts are shown under that bar too.
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
  const existingQuorum = knownQuorum(votes?.quorum);

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

  const current = votes
    ? sumVoteCounts(votes.forVotes, votes.abstainVotes)
    : "0";
  const quorum = existingQuorum ?? knownQuorum(fetchedQuorum);

  // Executed: reached by definition, render a full bar with no fetch. The
  // counts ride along only when the quorum is already known.
  if (isExecuted) {
    return (
      <div ref={ref}>
        {votes && quorum ? (
          <QuorumIndicator
            current={current}
            required={quorum}
            showCounts
            reached
          />
        ) : (
          <QuorumIndicator current="1" required="1" reached />
        )}
      </div>
    );
  }

  if (quorum) {
    return (
      <div ref={ref}>
        <QuorumIndicator current={current} required={quorum} showCounts />
      </div>
    );
  }

  // Awaiting an in-view RPC fetch: skeleton track (keeps column width stable).
  if (needsFetch && (isLoading || !inView)) {
    return (
      <div ref={ref} className="w-32">
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
