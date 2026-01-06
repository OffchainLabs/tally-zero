"use client";

/**
 * Hook for searching proposals across multiple governors
 * Combines cached and fresh proposals with state refresh for active ones
 */

import { useCallback, useEffect, useState } from "react";

import { debug } from "@/lib/debug";
import {
  calculateSearchRanges,
  parseProposals,
  refreshProposalStates,
  searchGovernor,
  type CacheHitInfo,
  type UseMultiGovernorSearchOptions,
  type UseMultiGovernorSearchResult,
} from "@/lib/governor-search";
import {
  loadProposalCache,
  mergeProposals,
  needsStateRefresh,
  sortProposals,
  type ProposalCache,
} from "@/lib/proposal-cache";
import {
  subscribeToVoteUpdates,
  type VoteUpdate,
} from "@/lib/proposal-tracker-manager";
import { createRpcProvider } from "@/lib/rpc-utils";
import { ParsedProposal } from "@/types/proposal";
import {
  ARBITRUM_GOVERNORS,
  ARBITRUM_RPC_URL,
  BLOCKS_PER_DAY,
} from "@config/arbitrum-governance";

/** Default block range for chunked RPC queries */
const DEFAULT_BLOCK_RANGE = 10000000;

/**
 * Hook for searching proposals across Core and Treasury governors
 * @param options - Search options including days to search and RPC URL
 * @returns Proposals, progress, errors, and cache information
 */
export function useMultiGovernorSearch({
  daysToSearch,
  enabled,
  customRpcUrl,
  blockRange = DEFAULT_BLOCK_RANGE,
  skipCache = false,
}: UseMultiGovernorSearchOptions): UseMultiGovernorSearchResult {
  const [progress, setProgress] = useState(0);
  const [proposals, setProposals] = useState<ParsedProposal[]>([]);
  const [error, setError] = useState<Error | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [providerReady, setProviderReady] = useState(false);
  const [cacheInfo, setCacheInfo] = useState<CacheHitInfo>();
  const [cache, setCache] = useState<ProposalCache | null>(null);

  const rpcUrl = customRpcUrl || ARBITRUM_RPC_URL;

  // Load cache on mount (unless skipping)
  useEffect(() => {
    if (skipCache) {
      setCache(null);
      return;
    }

    loadProposalCache().then((loaded) => {
      if (loaded) {
        setCache(loaded);
        // Show cached proposals immediately (sorted)
        setProposals(sortProposals(loaded.proposals));
        setCacheInfo({
          loaded: true,
          snapshotBlock: loaded.snapshotBlock,
          cacheStartBlock: loaded.startBlock,
          cachedCount: loaded.proposals.length,
          freshCount: 0,
          cacheUsed: true,
          rangeInfo: `Cache loaded: blocks ${loaded.startBlock.toLocaleString()}-${loaded.snapshotBlock.toLocaleString()}`,
        });
        debug.search(
          "cache loaded: %d proposals (blocks %d-%d)",
          loaded.proposals.length,
          loaded.startBlock,
          loaded.snapshotBlock
        );
      }
    });
  }, [skipCache]);

  // Initialize provider using cached factory
  useEffect(() => {
    setProviderReady(false);
    createRpcProvider(rpcUrl)
      .then(() => setProviderReady(true))
      .catch((err) => setError(err as Error));
  }, [rpcUrl]);

  // Search for proposals
  useEffect(() => {
    if (!enabled || !providerReady) return;

    const abortController = new AbortController();
    let cancelled = false;

    const search = async () => {
      setIsSearching(true);
      setError(null);
      setProgress(0);

      try {
        const provider = await createRpcProvider(rpcUrl);
        const currentBlock = await provider.getBlockNumber();

        // Calculate user's desired search range
        const blocksToSearch = BLOCKS_PER_DAY.arbitrum * daysToSearch;
        const userStartBlock = Math.max(currentBlock - blocksToSearch, 0);
        const userEndBlock = currentBlock;

        // Determine what needs to be fetched from RPC vs cache
        const searchPlan = calculateSearchRanges(
          userStartBlock,
          userEndBlock,
          cache,
          skipCache
        );

        debug.search("search plan: %s", searchPlan.rangeInfo);

        let rpcProposals: ParsedProposal[] = [];
        let cachedProposals: ParsedProposal[] = [];

        // Fetch from RPC if needed
        if (searchPlan.rpcRanges.length > 0) {
          const totalRanges =
            searchPlan.rpcRanges.length * ARBITRUM_GOVERNORS.length;
          let completedQueries = 0;

          const updateProgress = () => {
            if (cancelled) return;
            const searchProgress = (completedQueries / totalRanges) * 70;
            setProgress(searchProgress);
          };

          for (const range of searchPlan.rpcRanges) {
            if (abortController.signal.aborted) break;

            const searchPromises = ARBITRUM_GOVERNORS.map(async (governor) => {
              if (abortController.signal.aborted) return [];

              const rawProposals = await searchGovernor(
                provider,
                governor.address,
                range.start,
                range.end,
                blockRange,
                () => {
                  // Individual query progress
                }
              );

              completedQueries++;
              updateProgress();
              return rawProposals;
            });

            const results = await Promise.all(searchPromises);
            if (cancelled || abortController.signal.aborted) return;

            const rawProposals = results.flat();
            if (rawProposals.length > 0) {
              const parsed = await parseProposals(provider, rawProposals);
              rpcProposals.push(...parsed);
            }
          }
        }

        setProgress(70);
        if (cancelled || abortController.signal.aborted) return;

        if (searchPlan.useCache && cache) {
          cachedProposals = cache.proposals;
          debug.search("using %d cached proposals", cachedProposals.length);
        }

        // Refresh state for pending/active cached proposals
        setProgress(80);
        const proposalsToRefresh = cachedProposals.filter((p) =>
          needsStateRefresh(p.state)
        );

        if (proposalsToRefresh.length > 0) {
          debug.search(
            "refreshing %d pending/active proposals",
            proposalsToRefresh.length
          );
          const refreshed = await refreshProposalStates(
            provider,
            proposalsToRefresh
          );

          // Replace with refreshed versions
          cachedProposals = cachedProposals.map((p) => {
            const updated = refreshed.find((r) => r.id === p.id);
            return updated ?? p;
          });
        }

        setProgress(90);
        if (cancelled || abortController.signal.aborted) return;

        // Merge cached and fresh proposals
        const allProposals = mergeProposals(cachedProposals, rpcProposals);

        // Sort: active first, then by startBlock descending
        setProposals(sortProposals(allProposals));
        setCacheInfo({
          loaded: cache !== null,
          snapshotBlock: cache?.snapshotBlock ?? 0,
          cacheStartBlock: cache?.startBlock ?? 0,
          cachedCount: cachedProposals.length,
          freshCount: rpcProposals.length,
          cacheUsed: searchPlan.useCache,
          rangeInfo: searchPlan.rangeInfo,
        });
        setProgress(100);
        setIsSearching(false);
      } catch (err) {
        if (!cancelled && !abortController.signal.aborted) {
          setError(err as Error);
          setIsSearching(false);
        }
      }
    };

    search();

    return () => {
      cancelled = true;
      abortController.abort();
    };
  }, [
    enabled,
    providerReady,
    daysToSearch,
    rpcUrl,
    blockRange,
    skipCache,
    cache,
  ]);

  // Handle vote updates from lifecycle tracking
  const handleVoteUpdate = useCallback((update: VoteUpdate) => {
    setProposals((currentProposals) => {
      const proposalIndex = currentProposals.findIndex(
        (p) =>
          p.id === update.proposalId &&
          p.contractAddress.toLowerCase() ===
            update.governorAddress.toLowerCase()
      );

      if (proposalIndex === -1) return currentProposals;

      const updatedProposals = [...currentProposals];
      const proposal = updatedProposals[proposalIndex];

      updatedProposals[proposalIndex] = {
        ...proposal,
        votes: {
          forVotes: update.forVotes,
          againstVotes: update.againstVotes,
          abstainVotes: update.abstainVotes,
          quorum: proposal.votes?.quorum,
        },
      };

      return updatedProposals;
    });
  }, []);

  // Subscribe to vote updates from lifecycle tracking
  useEffect(() => {
    const unsubscribe = subscribeToVoteUpdates(handleVoteUpdate);
    return () => unsubscribe();
  }, [handleVoteUpdate]);

  return {
    proposals,
    progress,
    error,
    isSearching,
    isProviderReady: providerReady,
    cacheInfo,
  };
}
