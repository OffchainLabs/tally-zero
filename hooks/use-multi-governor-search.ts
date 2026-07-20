"use client";

/**
 * Hook for searching proposals across multiple governors.
 * Uses TanStack Query for caching so data persists across navigations
 * and avoids unnecessary refetches.
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
  type CacheHitInfo,
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
import { useRpcProvider } from "./use-rpc-provider";

/** Default block range for chunked RPC queries */
const DEFAULT_BLOCK_RANGE = 10000000;
const UNKNOWN_PROPOSER = "0x0000000000000000000000000000000000000000";

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

/** Query key factory for proposal searches */
export const proposalKeys = {
  all: ["proposals"] as const,
  search: (rpcUrl: string, daysToSearch: number, blockRange: number) =>
    ["proposals", "search", rpcUrl, daysToSearch, blockRange] as const,
};

/** Shape of data stored in the TanStack Query cache */
interface ProposalSearchData {
  proposals: ParsedProposal[];
  cacheInfo: CacheHitInfo;
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

async function loadIndexedProposalIndexProposals(): Promise<ParsedProposal[]> {
  try {
    const client = getTallyDataClient();
    const entries = await client.getProposalsIndex();
    const voteSummaries = await Promise.all(
      entries.map((entry) =>
        client
          .getProposalVoteSummary(entry.proposalId, entry.governorAddress)
          .catch(() => null)
      )
    );

    return entries.map((entry, index) =>
      proposalFromSqliteIndexEntry(entry, voteSummaries[index])
    );
  } catch (error) {
    debug.search("failed to load indexed proposals: %O", error);
    return [];
  }
}

/**
 * Hook for searching proposals across Core and Treasury governors.
 * Backed by TanStack Query so results are cached across navigations
 * and only refetched when stale (5 minutes by default).
 */
export function useMultiGovernorSearch({
  daysToSearch,
  enabled,
  customRpcUrl,
  blockRange = DEFAULT_BLOCK_RANGE,
}: UseMultiGovernorSearchOptions): UseMultiGovernorSearchResult {
  const [progress, setProgress] = useState(0);
  const lastIncompleteRefreshKeyRef = useRef<string | null>(null);
  const queryClient = useQueryClient();

  const rpcUrl = customRpcUrl || ARBITRUM_RPC_URL;
  const { isReady: providerReady, error: providerError } =
    useRpcProvider(rpcUrl);

  const {
    data,
    error: queryError,
    isFetching,
  } = useQuery<ProposalSearchData>({
    queryKey: proposalKeys.search(rpcUrl, daysToSearch, blockRange),
    queryFn: async ({ signal }) => {
      setProgress(0);

      const provider = await createRpcProvider(rpcUrl);
      const currentBlock = await provider.getBlockNumber();

      const blocksToSearch = BLOCKS_PER_DAY.arbitrum * daysToSearch;
      const userStartBlock = Math.max(currentBlock - blocksToSearch, 0);

      setProgress(5);
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

      const [indexedProposals, indexedWatermarkBlock] = await Promise.all([
        loadIndexedProposalIndexProposals(),
        getDelegateVotesWatermarkBlock().catch(() => 0),
      ]);

      setProgress(10);
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

      const proposalsByKey = new Map<string, ParsedProposal>();
      for (const proposal of indexedProposals) {
        upsertProposal(proposalsByKey, proposal);
      }

      const cachedCount = proposalsByKey.size;

      debug.search(
        "loaded %d proposals from indexer (watermark block %d)",
        cachedCount,
        indexedWatermarkBlock
      );

      const proposalsNeedingRefresh = Array.from(
        proposalsByKey.values()
      ).filter((proposal) => RPC_REFRESH_STATES.has(proposal.state));

      if (proposalsNeedingRefresh.length > 0) {
        debug.search(
          "refreshing %d active/pending/unknown proposals from RPC",
          proposalsNeedingRefresh.length
        );

        const refreshed = await refreshProposalStates(
          provider,
          proposalsNeedingRefresh
        );

        for (const proposal of refreshed) {
          upsertProposal(proposalsByKey, proposal);
        }
      }

      setProgress(30);
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

      const rpcStartBlock =
        indexedWatermarkBlock > 0
          ? Math.max(indexedWatermarkBlock + 1, userStartBlock)
          : userStartBlock;

      let freshCount = 0;

      if (rpcStartBlock < currentBlock) {
        debug.search(
          "searching RPC blocks %d to %d",
          rpcStartBlock,
          currentBlock
        );

        const searchResults = await Promise.all(
          ARBITRUM_GOVERNORS.map((governor) =>
            searchGovernor(
              provider,
              governor.address,
              rpcStartBlock,
              currentBlock,
              blockRange,
              () => {}
            )
          )
        );

        if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
        setProgress(60);

        const allRawProposals = searchResults.flat();
        if (allRawProposals.length > 0) {
          const parsed = await parseProposals(provider, allRawProposals);
          for (const p of parsed) {
            upsertProposal(proposalsByKey, p);
            freshCount++;
          }
        }
      } else {
        debug.search(
          "skipping RPC search - watermark %d covers search range",
          indexedWatermarkBlock
        );
        setProgress(80);
      }

      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

      setProgress(100);

      return {
        proposals: sortProposals(Array.from(proposalsByKey.values())),
        cacheInfo: {
          loaded: cachedCount > 0,
          snapshotBlock: indexedWatermarkBlock,
          cacheStartBlock: 0,
          cachedCount,
          freshCount,
          cacheUsed: cachedCount > 0,
          rangeInfo:
            cachedCount > 0
              ? `Cache: ${cachedCount} + RPC: ${rpcStartBlock} \u2192 ${currentBlock}`
              : `RPC: ${rpcStartBlock} \u2192 ${currentBlock}`,
        },
      };
    },
    enabled: enabled && providerReady,
    staleTime: Infinity, // never refetch after initial load
    gcTime: 30 * 60 * 1000, // 30 min: keep unused data in cache
    retry: false,
  });

  // Subscribe to live vote updates and patch the query cache
  useEffect(() => {
    return subscribeToVoteUpdates((update: VoteUpdate) => {
      queryClient.setQueryData<ProposalSearchData>(
        proposalKeys.search(rpcUrl, daysToSearch, blockRange),
        (prev) => {
          if (!prev) return prev;

          const updateKey = `${update.proposalId}:${update.governorAddress.toLowerCase()}`;
          const idx = prev.proposals.findIndex(
            (p) => `${p.id}:${p.contractAddress.toLowerCase()}` === updateKey
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
  }, [queryClient, rpcUrl, daysToSearch, blockRange]);

  // When the proposals page remounts with cached query data, the queryFn does not rerun because
  // staleTime is Infinity. Refresh active proposals in the background so live vote tallies
  // advance without forcing a full RPC re-search.
  useEffect(() => {
    if (!enabled || !providerReady || isFetching || !data) return;

    const proposalsNeedingRefresh = data.proposals.filter((proposal) =>
      RPC_REFRESH_STATES.has(proposal.state)
    );

    if (proposalsNeedingRefresh.length === 0) {
      lastIncompleteRefreshKeyRef.current = null;
      return;
    }

    const refreshKey = proposalsNeedingRefresh
      .map(
        (proposal) =>
          `${proposal.id}:${proposal.contractAddress.toLowerCase()}:${proposal.state.toLowerCase()}`
      )
      .sort()
      .join("|");

    if (lastIncompleteRefreshKeyRef.current === refreshKey) {
      return;
    }

    lastIncompleteRefreshKeyRef.current = refreshKey;
    let cancelled = false;

    void (async () => {
      try {
        const provider = await createRpcProvider(rpcUrl);
        const refreshed = await refreshProposalStates(
          provider,
          proposalsNeedingRefresh
        );

        if (cancelled) return;

        const refreshedMap = buildLookupMap(
          refreshed,
          (proposal) =>
            `${proposal.id}:${proposal.contractAddress.toLowerCase()}`
        );

        queryClient.setQueryData<ProposalSearchData>(
          proposalKeys.search(rpcUrl, daysToSearch, blockRange),
          (prev) => {
            if (!prev) return prev;

            let changed = false;
            const updatedProposals = prev.proposals.map((proposal) => {
              const updated = refreshedMap.get(
                `${proposal.id}:${proposal.contractAddress.toLowerCase()}`
              );

              if (!updated) return proposal;

              const sameState = updated.state === proposal.state;
              const sameVotes =
                updated.votes?.forVotes === proposal.votes?.forVotes &&
                updated.votes?.againstVotes === proposal.votes?.againstVotes &&
                updated.votes?.abstainVotes === proposal.votes?.abstainVotes &&
                updated.votes?.quorum === proposal.votes?.quorum;

              if (sameState && sameVotes) {
                return proposal;
              }

              changed = true;
              return updated;
            });

            if (!changed) {
              return prev;
            }

            return {
              ...prev,
              proposals: sortProposals(updatedProposals),
            };
          }
        );
      } catch (error) {
        debug.search("background refresh failed: %O", error);
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
    providerReady,
    queryClient,
    rpcUrl,
  ]);

  // Derive progress: if we already have data and aren't fetching, always 100
  const effectiveProgress = data && !isFetching ? 100 : progress;

  return {
    proposals: data?.proposals ?? [],
    progress: effectiveProgress,
    error: providerError ?? queryError ?? null,
    isSearching: isFetching,
    isProviderReady: providerReady,
    cacheInfo: data?.cacheInfo,
  };
}
