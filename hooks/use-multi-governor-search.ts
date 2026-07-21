"use client";

/**
 * Hook for searching proposals across multiple governors.
 *
 * Indexer-first: the proposal list is loaded from the governance indexer in a
 * single fast query and rendered immediately. Everything else is non-blocking
 * and patches the query cache in the background: per-proposal vote summaries
 * (one indexer request each, far too slow to block on), RPC state refresh for
 * active proposals, and the RPC gap scan from the indexer watermark to the
 * chain head. See docs/plans/plan-indexer-first-proposals.md.
 */

import { useEffect, useRef, useState } from "react";

import { useQuery, useQueryClient } from "@tanstack/react-query";

import { findByAddress } from "@/lib/address-utils";
import { buildLookupMap } from "@/lib/collection-utils";
import { debug } from "@/lib/debug";
import { getDelegateVotesWatermarkBlock } from "@/lib/delegate-cache";
import {
  parseProposals,
  refreshProposalStates,
  searchGovernor,
  type ProposalSourceInfo,
  type UseMultiGovernorSearchOptions,
  type UseMultiGovernorSearchResult,
} from "@/lib/governor-search";
import { sortProposals } from "@/lib/proposal-cache";
import {
  subscribeToVoteUpdates,
  type VoteUpdate,
} from "@/lib/proposal-tracker-manager";
import { createRpcProvider } from "@/lib/rpc-utils";
import { getTallyDataClient } from "@/lib/tally-data/client";
import type {
  TallyProposalIndexEntry,
  TallyProposalVoteSummary,
} from "@/lib/tally-data/types";
import type {
  ParsedProposal,
  ProposalStateName,
  ProposalVotes,
} from "@/types/proposal";
import {
  ARBITRUM_CHAIN_ID,
  ARBITRUM_GOVERNORS,
  ARBITRUM_RPC_URL,
} from "@config/arbitrum-governance";
import { BLOCKS_PER_DAY } from "@config/block-times";

/** Default block range for chunked RPC queries */
const DEFAULT_BLOCK_RANGE = 10000000;
const UNKNOWN_PROPOSER = "0x0000000000000000000000000000000000000000";

/**
 * The indexer watermark always trails the chain head slightly (Arbitrum
 * produces a block every ~250ms and the indexer API responses are cached for
 * up to 30s), so a strict `watermark >= head` check would never pass. Treat
 * the indexer as caught up when the watermark is within this many blocks of
 * the head and skip the RPC gap scan entirely.
 */
const WATERMARK_TOLERANCE_MINUTES = 5;
const WATERMARK_TOLERANCE_BLOCKS = Math.ceil(
  (BLOCKS_PER_DAY.arbitrum / (24 * 60)) * WATERMARK_TOLERANCE_MINUTES
);

const VALID_PROPOSAL_STATES: ProposalStateName[] = [
  "Pending",
  "Active",
  "Canceled",
  "Defeated",
  "Succeeded",
  "Queued",
  "Expired",
  "Executed",
];

const RPC_REFRESH_STATES = new Set<ProposalStateName>([
  "Active",
  "Pending",
  "Unknown",
]);

/**
 * Vote summaries are one request per proposal; fetch them in small batches so
 * the background fill does not monopolize the browser's per-origin connection
 * pool (6 on HTTP/1.1) while the user navigates.
 */
const VOTE_SUMMARY_BATCH_SIZE = 8;

/** Query key factory for proposal searches */
export const proposalKeys = {
  all: ["proposals"] as const,
  indexer: () => ["proposals", "indexer"] as const,
};

/** Shape of data stored in the TanStack Query cache */
interface ProposalSearchData {
  proposals: ParsedProposal[];
  sourceInfo: ProposalSourceInfo;
}

function proposalIdentityKey(
  proposalId: string,
  governorAddress: string
): string {
  return `${proposalId}:${governorAddress.toLowerCase()}`;
}

function proposalKey(proposal: ParsedProposal): string {
  return proposalIdentityKey(proposal.id, proposal.contractAddress);
}

function normalizeProposalState(
  state: string | null | undefined
): ProposalStateName {
  const normalized = state?.toLowerCase();
  const match = VALID_PROPOSAL_STATES.find(
    (value) => value.toLowerCase() === normalized
  );

  return match ?? "Unknown";
}

function voteSummaryToProposalVotes(
  summary: TallyProposalVoteSummary | null
): ProposalVotes | undefined {
  if (!summary || summary.totalCount === 0) return undefined;

  return {
    forVotes: summary.for.weight,
    againstVotes: summary.against.weight,
    abstainVotes: summary.abstain.weight,
    quorum: undefined,
  };
}

function proposalFromSqliteIndexEntry(
  entry: TallyProposalIndexEntry,
  voteSummary: TallyProposalVoteSummary | null
): ParsedProposal {
  const governor = findByAddress(ARBITRUM_GOVERNORS, entry.governorAddress);

  return {
    id: entry.proposalId,
    contractAddress: entry.governorAddress as ParsedProposal["contractAddress"],
    proposer: entry.proposer ?? UNKNOWN_PROPOSER,
    targets: [],
    values: [],
    signatures: [],
    calldatas: [],
    startBlock: String(entry.snapshotBlock),
    endBlock: "0",
    description: entry.description ?? `Proposal ${entry.proposalId}`,
    networkId: String(ARBITRUM_CHAIN_ID),
    state: normalizeProposalState(entry.state),
    governorName: governor?.name ?? "Unknown",
    votes: voteSummaryToProposalVotes(voteSummary),
  };
}

function isPlaceholderProposal(proposal: ParsedProposal): boolean {
  const description = proposal.description.trim();

  return (
    (!description || description === `Proposal ${proposal.id}`) &&
    (proposal.proposer === UNKNOWN_PROPOSER || proposal.proposer === "Unknown")
  );
}

function mergeProposal(
  existing: ParsedProposal,
  incoming: ParsedProposal
): ParsedProposal {
  const incomingIsPlaceholder = isPlaceholderProposal(incoming);
  const existingIsPlaceholder = isPlaceholderProposal(existing);
  const state = incoming.state === "Unknown" ? existing.state : incoming.state;

  if (incomingIsPlaceholder && !existingIsPlaceholder) {
    return {
      ...existing,
      state,
      votes: existing.votes ?? incoming.votes,
      governorName: existing.governorName || incoming.governorName,
      startBlock:
        existing.startBlock !== "0" ? existing.startBlock : incoming.startBlock,
      endBlock:
        existing.endBlock !== "0" ? existing.endBlock : incoming.endBlock,
    };
  }

  if (!incomingIsPlaceholder && existingIsPlaceholder) {
    return {
      ...incoming,
      votes: incoming.votes ?? existing.votes,
      state,
    };
  }

  return {
    ...incoming,
    votes: incoming.votes ?? existing.votes,
    state,
    stages: incoming.stages ?? existing.stages,
    timelockLink: incoming.timelockLink ?? existing.timelockLink,
  };
}

function upsertProposal(
  proposalsByKey: Map<string, ParsedProposal>,
  proposal: ParsedProposal
): void {
  const key = proposalKey(proposal);
  const existing = proposalsByKey.get(key);

  proposalsByKey.set(
    key,
    existing ? mergeProposal(existing, proposal) : proposal
  );
}

function sameStateAndVotes(a: ParsedProposal, b: ParsedProposal): boolean {
  return (
    a.state === b.state &&
    a.votes?.forVotes === b.votes?.forVotes &&
    a.votes?.againstVotes === b.votes?.againstVotes &&
    a.votes?.abstainVotes === b.votes?.abstainVotes &&
    a.votes?.quorum === b.votes?.quorum
  );
}

/**
 * Loads all proposals from the governance indexer index (one request).
 * Vote summaries are filled in later by the background effect.
 * Throws if the index fetch fails.
 */
async function loadIndexedProposals(): Promise<ParsedProposal[]> {
  const client = getTallyDataClient();
  const entries = await client.getProposalsIndex();

  return entries.map((entry) => proposalFromSqliteIndexEntry(entry, null));
}

/**
 * Hook for searching proposals across Core and Treasury governors.
 * Renders indexer data immediately; RPC state refresh and gap scan run in the
 * background and patch the shared query cache.
 */
export function useMultiGovernorSearch({
  daysToSearch,
  enabled,
  customRpcUrl,
  blockRange = DEFAULT_BLOCK_RANGE,
}: UseMultiGovernorSearchOptions): UseMultiGovernorSearchResult {
  const lastReconcileKeyRef = useRef<string | null>(null);
  const reconcileRunIdRef = useRef(0);
  const requestedVoteSummariesRef = useRef<Set<string>>(new Set());
  const [isReconciling, setIsReconciling] = useState(false);
  const [rpcError, setRpcError] = useState<Error | null>(null);
  const queryClient = useQueryClient();

  const rpcUrl = customRpcUrl || ARBITRUM_RPC_URL;

  const {
    data,
    error: queryError,
    isFetching,
  } = useQuery<ProposalSearchData>({
    queryKey: proposalKeys.indexer(),
    queryFn: async () => {
      try {
        const [indexedProposals, watermarkBlock] = await Promise.all([
          loadIndexedProposals(),
          getDelegateVotesWatermarkBlock().catch(() => 0),
        ]);

        const proposalsByKey = new Map<string, ParsedProposal>();
        for (const proposal of indexedProposals) {
          upsertProposal(proposalsByKey, proposal);
        }

        debug.search(
          "loaded %d proposals from indexer (watermark block %d)",
          proposalsByKey.size,
          watermarkBlock
        );

        return {
          proposals: sortProposals(Array.from(proposalsByKey.values())),
          sourceInfo: {
            indexerAvailable: true,
            indexedCount: proposalsByKey.size,
            rpcFreshCount: 0,
            watermarkBlock,
            reconciled: false,
          },
        };
      } catch (error) {
        // Indexer down or unconfigured: fall back to the background RPC
        // search, which populates this same cache entry.
        debug.search("failed to load indexed proposals: %O", error);

        return {
          proposals: [],
          sourceInfo: {
            indexerAvailable: false,
            indexedCount: 0,
            rpcFreshCount: 0,
            watermarkBlock: 0,
            reconciled: false,
          },
        };
      }
    },
    enabled,
    staleTime: Infinity, // never refetch after initial load
    gcTime: 30 * 60 * 1000, // 30 min: keep unused data in cache
    retry: false,
  });

  // Subscribe to live vote updates and patch the query cache
  useEffect(() => {
    return subscribeToVoteUpdates((update: VoteUpdate) => {
      queryClient.setQueryData<ProposalSearchData>(
        proposalKeys.indexer(),
        (prev) => {
          if (!prev) return prev;

          const updateKey = proposalIdentityKey(
            update.proposalId,
            update.governorAddress
          );
          const idx = prev.proposals.findIndex(
            (p) => proposalKey(p) === updateKey
          );

          if (idx === -1) return prev;

          debug.search(
            "updating votes for proposal %s: for=%s, against=%s",
            update.proposalId,
            update.forVotes,
            update.againstVotes
          );

          const updatedProposals = [...prev.proposals];
          updatedProposals[idx] = {
            ...prev.proposals[idx],
            votes: {
              forVotes: update.forVotes,
              againstVotes: update.againstVotes,
              abstainVotes: update.abstainVotes,
              quorum: prev.proposals[idx].votes?.quorum || "0",
            },
          };

          return { ...prev, proposals: updatedProposals };
        }
      );
    });
  }, [queryClient]);

  // Background vote-summary fill: the index query renders without votes so
  // the table is not blocked on one request per proposal. One aggregated
  // request (this app's own API route) fetches every summary; because the
  // upstream indexer serves summaries serially (~200ms each), a cold
  // aggregate can take many seconds, so the first screen of rows is also
  // fetched directly in parallel. If the aggregate fails, fall back to
  // per-proposal batches in display order. Never overwrites votes that
  // arrived from an RPC refresh.
  useEffect(() => {
    if (!enabled || isFetching || !data) return;

    const requested = requestedVoteSummariesRef.current;
    const missing = data.proposals.filter(
      (proposal) => !proposal.votes && !requested.has(proposalKey(proposal))
    );

    if (missing.length === 0) return;

    let cancelled = false;
    const client = getTallyDataClient();

    const patchVotes = (votesByKey: Map<string, ProposalVotes>) => {
      if (votesByKey.size === 0) return;

      queryClient.setQueryData<ProposalSearchData>(
        proposalKeys.indexer(),
        (prev) => {
          if (!prev) return prev;

          let changed = false;
          const proposals = prev.proposals.map((proposal) => {
            const votes = votesByKey.get(proposalKey(proposal));
            if (!votes || proposal.votes) return proposal;
            changed = true;
            return { ...proposal, votes };
          });

          return changed ? { ...prev, proposals } : prev;
        }
      );
    };

    const fetchBatch = async (batch: ParsedProposal[]) => {
      for (const proposal of batch) requested.add(proposalKey(proposal));

      const summaries = await Promise.all(
        batch.map((proposal) =>
          client
            .getProposalVoteSummary(proposal.id, proposal.contractAddress)
            .catch(() => null)
        )
      );

      if (cancelled) return;

      const votesByKey = new Map<string, ProposalVotes>();
      batch.forEach((proposal, index) => {
        const votes = voteSummaryToProposalVotes(summaries[index]);
        if (votes) votesByKey.set(proposalKey(proposal), votes);
      });

      patchVotes(votesByKey);
    };

    void (async () => {
      // Visible rows first: don't leave the first screen without vote bars
      // while a cold aggregate response is being assembled upstream.
      const firstBatchDone = fetchBatch(
        missing.slice(0, VOTE_SUMMARY_BATCH_SIZE)
      );

      const aggregated = await client
        .getAllProposalVoteSummaries()
        .catch(() => null);
      await firstBatchDone;

      if (cancelled) return;

      if (aggregated) {
        for (const proposal of missing) requested.add(proposalKey(proposal));

        const votesByKey = new Map<string, ProposalVotes>();
        for (const entry of aggregated) {
          const votes = voteSummaryToProposalVotes(entry.voteSummary);
          if (votes) {
            votesByKey.set(
              proposalIdentityKey(entry.proposalId, entry.governorAddress),
              votes
            );
          }
        }

        patchVotes(votesByKey);
        return;
      }

      debug.search("aggregated vote summaries failed, falling back to batches");

      for (
        let i = VOTE_SUMMARY_BATCH_SIZE;
        i < missing.length;
        i += VOTE_SUMMARY_BATCH_SIZE
      ) {
        if (cancelled) return;
        await fetchBatch(missing.slice(i, i + VOTE_SUMMARY_BATCH_SIZE));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [data, enabled, isFetching, queryClient]);

  // Background RPC reconciliation: refresh live states for active proposals
  // and scan the watermark-to-head gap for proposals the indexer has not
  // indexed yet. Never blocks rendering of the indexer data.
  useEffect(() => {
    if (!enabled || isFetching || !data) return;

    const needsGapScan = !data.sourceInfo.reconciled;
    const proposalsNeedingRefresh = data.proposals.filter((proposal) =>
      RPC_REFRESH_STATES.has(proposal.state)
    );

    if (!needsGapScan && proposalsNeedingRefresh.length === 0) {
      return;
    }

    const reconcileKey = [
      rpcUrl,
      daysToSearch,
      blockRange,
      needsGapScan ? `gap:${data.sourceInfo.watermarkBlock}` : "nogap",
      proposalsNeedingRefresh
        .map(
          (proposal) =>
            `${proposalKey(proposal)}:${proposal.state.toLowerCase()}`
        )
        .sort()
        .join("|"),
    ].join("::");

    if (lastReconcileKeyRef.current === reconcileKey) {
      return;
    }

    lastReconcileKeyRef.current = reconcileKey;
    const runId = ++reconcileRunIdRef.current;
    let cancelled = false;
    setIsReconciling(true);
    setRpcError(null);

    void (async () => {
      try {
        const provider = await createRpcProvider(rpcUrl);
        const currentBlock = await provider.getBlockNumber();

        const watermarkBlock = data.sourceInfo.watermarkBlock;
        const userStartBlock = Math.max(
          currentBlock - BLOCKS_PER_DAY.arbitrum * daysToSearch,
          0
        );

        let gapStartBlock: number | null = null;
        if (needsGapScan) {
          if (!data.sourceInfo.indexerAvailable) {
            gapStartBlock = userStartBlock;
          } else {
            const indexerCaughtUp =
              watermarkBlock > 0 &&
              currentBlock - watermarkBlock <= WATERMARK_TOLERANCE_BLOCKS;
            const rpcStartBlock = Math.max(watermarkBlock + 1, userStartBlock);

            gapStartBlock =
              !indexerCaughtUp && rpcStartBlock < currentBlock
                ? rpcStartBlock
                : null;
          }
        }

        if (gapStartBlock !== null) {
          debug.search(
            "gap-scanning RPC blocks %d to %d",
            gapStartBlock,
            currentBlock
          );
        } else if (needsGapScan) {
          debug.search(
            "skipping RPC gap scan - watermark %d within tolerance of head %d",
            watermarkBlock,
            currentBlock
          );
        }

        const scanStartBlock = gapStartBlock;
        const [refreshed, gapProposals] = await Promise.all([
          proposalsNeedingRefresh.length > 0
            ? refreshProposalStates(provider, proposalsNeedingRefresh)
            : Promise.resolve([] as ParsedProposal[]),
          scanStartBlock !== null
            ? (async () => {
                const searchResults = await Promise.all(
                  ARBITRUM_GOVERNORS.map((governor) =>
                    searchGovernor(
                      provider,
                      governor.address,
                      scanStartBlock,
                      currentBlock,
                      blockRange,
                      () => {}
                    )
                  )
                );
                const rawProposals = searchResults.flat();
                return rawProposals.length > 0
                  ? parseProposals(provider, rawProposals)
                  : [];
              })()
            : Promise.resolve([] as ParsedProposal[]),
        ]);

        if (cancelled) return;

        const refreshedMap = buildLookupMap(refreshed, proposalKey);

        queryClient.setQueryData<ProposalSearchData>(
          proposalKeys.indexer(),
          (prev) => {
            if (!prev) return prev;

            let changed = !prev.sourceInfo.reconciled;

            const proposalsByKey = new Map<string, ParsedProposal>();
            for (const proposal of prev.proposals) {
              const updated = refreshedMap.get(proposalKey(proposal));
              if (updated && !sameStateAndVotes(updated, proposal)) {
                changed = true;
                proposalsByKey.set(
                  proposalKey(proposal),
                  mergeProposal(proposal, updated)
                );
              } else {
                proposalsByKey.set(proposalKey(proposal), proposal);
              }
            }

            let rpcFreshCount = prev.sourceInfo.rpcFreshCount;
            for (const proposal of gapProposals) {
              if (!proposalsByKey.has(proposalKey(proposal))) {
                rpcFreshCount++;
              }
              changed = true;
              upsertProposal(proposalsByKey, proposal);
            }

            if (!changed) return prev;

            return {
              proposals: sortProposals(Array.from(proposalsByKey.values())),
              sourceInfo: {
                ...prev.sourceInfo,
                rpcFreshCount,
                reconciled: true,
                rangeInfo:
                  scanStartBlock !== null
                    ? `RPC scan: ${scanStartBlock} → ${currentBlock}`
                    : `Indexer synced to block ${watermarkBlock} (head ${currentBlock})`,
              },
            };
          }
        );
      } catch (error) {
        debug.search("background reconciliation failed: %O", error);
        if (!cancelled) setRpcError(error as Error);
      } finally {
        // Only the latest run owns the flag; a cancelled run must not clear
        // (or leave set) the state of the run that superseded it.
        if (reconcileRunIdRef.current === runId) setIsReconciling(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    blockRange,
    data,
    daysToSearch,
    enabled,
    isFetching,
    queryClient,
    rpcUrl,
  ]);

  // Indexer unavailable and the RPC fallback has not finished: consumers
  // should keep showing a loader instead of an empty table.
  const waitingOnRpcFallback = Boolean(
    data &&
    !data.sourceInfo.indexerAvailable &&
    !data.sourceInfo.reconciled &&
    !rpcError
  );

  // Blocking error only when nothing could be loaded from either source
  const blockingError =
    data && !data.sourceInfo.indexerAvailable && !data.sourceInfo.reconciled
      ? rpcError
      : null;

  return {
    proposals: data?.proposals ?? [],
    error: (queryError as Error | null) ?? blockingError,
    isSearching: isFetching || waitingOnRpcFallback,
    isReconciling,
    rpcError,
    sourceInfo: data?.sourceInfo,
  };
}
