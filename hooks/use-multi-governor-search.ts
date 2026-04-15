"use client";

/**
 * Hook for searching proposals across multiple governors.
 * Uses TanStack Query for caching so data persists across navigations
 * and avoids unnecessary refetches.
 */

import { useEffect, useRef, useState } from "react";

import { useQuery, useQueryClient } from "@tanstack/react-query";

import {
  extractProposalsFromBundledCache,
  getBundledCacheWatermarks,
} from "@/lib/bundled-cache-loader";
import { buildLookupMap } from "@/lib/collection-utils";
import { debug } from "@/lib/debug";
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
import { ParsedProposal } from "@/types/proposal";
import {
  ARBITRUM_GOVERNORS,
  ARBITRUM_RPC_URL,
} from "@config/arbitrum-governance";
import { BLOCKS_PER_DAY } from "@config/block-times";
import { useRpcProvider } from "./use-rpc-provider";

/** Default block range for chunked RPC queries */
const DEFAULT_BLOCK_RANGE = 10000000;

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

function isIncompleteProposalState(state: string | undefined): boolean {
  const normalizedState = state?.toLowerCase();
  return (
    normalizedState === "pending" ||
    normalizedState === "active" ||
    normalizedState === "queued"
  );
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

      const [
        { proposals: cachedProposals, incompleteProposalIds },
        watermarks,
      ] = await Promise.all([
        extractProposalsFromBundledCache(),
        getBundledCacheWatermarks(),
      ]);

      setProgress(10);
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

      const allProposals: ParsedProposal[] = [...cachedProposals];
      const cachedCount = cachedProposals.length;
      let cacheWatermarkBlock =
        watermarks?.watermarks.constitutionalGovernor ?? 0;

      debug.search(
        "extracted %d proposals from cache (%d incomplete)",
        cachedCount,
        incompleteProposalIds.size
      );

      if (incompleteProposalIds.size > 0) {
        const activeProposals = allProposals.filter((p) =>
          incompleteProposalIds.has(p.id)
        );
        debug.search(
          "refreshing %d incomplete proposals",
          activeProposals.length
        );

        const refreshed = await refreshProposalStates(
          provider,
          activeProposals
        );

        const refreshedMap = buildLookupMap(refreshed, (p) => p.id);
        for (let i = 0; i < allProposals.length; i++) {
          const updated = refreshedMap.get(allProposals[i].id);
          if (updated) {
            allProposals[i] = updated;
          }
        }
      }

      setProgress(30);
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

      if (watermarks) {
        debug.search(
          "bundled cache watermark at L2 block %d",
          cacheWatermarkBlock
        );
      }

      const rpcStartBlock = watermarks
        ? Math.max(cacheWatermarkBlock + 1, userStartBlock)
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
          const existingIds = new Set(allProposals.map((p) => p.id));
          for (const p of parsed) {
            if (!existingIds.has(p.id)) {
              allProposals.push(p);
              freshCount++;
            }
          }
        }
      } else {
        debug.search(
          "skipping RPC search - watermark %d covers search range",
          cacheWatermarkBlock
        );
        setProgress(80);
      }

      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

      setProgress(100);

      return {
        proposals: sortProposals(allProposals),
        cacheInfo: {
          loaded: cachedCount > 0,
          snapshotBlock: cacheWatermarkBlock,
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
  // staleTime is Infinity. Refresh incomplete proposals in the background so queued
  // or pending proposals can advance without forcing a full RPC re-search.
  useEffect(() => {
    if (!enabled || !providerReady || isFetching || !data) return;

    const incompleteProposals = data.proposals.filter((proposal) =>
      isIncompleteProposalState(proposal.state)
    );

    if (incompleteProposals.length === 0) {
      lastIncompleteRefreshKeyRef.current = null;
      return;
    }

    const refreshKey = incompleteProposals
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
          incompleteProposals
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
