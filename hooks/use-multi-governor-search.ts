"use client";

/**
 * Hook for searching proposals across multiple governors
 */

import { useEffect, useState } from "react";

import { debug } from "@/lib/debug";
import {
  parseProposals,
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
}: UseMultiGovernorSearchOptions): UseMultiGovernorSearchResult {
  const [progress, setProgress] = useState(0);
  const [proposals, setProposals] = useState<ParsedProposal[]>([]);
  const [error, setError] = useState<Error | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [providerReady, setProviderReady] = useState(false);
  const [cacheInfo, setCacheInfo] = useState<CacheHitInfo>();

  const rpcUrl = customRpcUrl || ARBITRUM_RPC_URL;

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

        // Calculate search range
        const blocksToSearch = BLOCKS_PER_DAY.arbitrum * daysToSearch;
        const startBlock = Math.max(currentBlock - blocksToSearch, 0);
        const endBlock = currentBlock;

        debug.search(
          "searching blocks %d to %d (%d days)",
          startBlock,
          endBlock,
          daysToSearch
        );

        setProgress(10);
        if (cancelled || abortController.signal.aborted) return;

        // Fetch from RPC for all governors
        const totalGovernors = ARBITRUM_GOVERNORS.length;
        let completedQueries = 0;
        const allProposals: ParsedProposal[] = [];

        const updateProgress = () => {
          if (cancelled) return;
          const searchProgress = 10 + (completedQueries / totalGovernors) * 60;
          setProgress(searchProgress);
        };

        for (const governor of ARBITRUM_GOVERNORS) {
          if (abortController.signal.aborted) break;

          const rawProposals = await searchGovernor(
            provider,
            governor.address,
            startBlock,
            endBlock,
            blockRange,
            () => {}
          );

          completedQueries++;
          updateProgress();

          if (rawProposals.length > 0) {
            const parsed = await parseProposals(provider, rawProposals);
            allProposals.push(...parsed);
          }
        }

        setProgress(80);
        if (cancelled || abortController.signal.aborted) return;

        // Sort: active first, then by startBlock descending
        setProposals(sortProposals(allProposals));
        setCacheInfo({
          loaded: false,
          snapshotBlock: 0,
          cacheStartBlock: 0,
          cachedCount: 0,
          freshCount: allProposals.length,
          cacheUsed: false,
          rangeInfo: `RPC: ${startBlock} → ${endBlock}`,
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
  }, [enabled, providerReady, daysToSearch, rpcUrl, blockRange]);

  // Subscribe to vote updates and update proposals when votes change
  useEffect(() => {
    return subscribeToVoteUpdates((update: VoteUpdate) => {
      setProposals((prev) =>
        prev.map((p) => {
          if (
            p.id === update.proposalId &&
            p.contractAddress.toLowerCase() ===
              update.governorAddress.toLowerCase()
          ) {
            debug.search(
              "updating votes for proposal %s: for=%s, against=%s",
              p.id,
              update.forVotes,
              update.againstVotes
            );
            return {
              ...p,
              votes: {
                forVotes: update.forVotes,
                againstVotes: update.againstVotes,
                abstainVotes: update.abstainVotes,
                quorum: p.votes?.quorum || "0",
              },
            };
          }
          return p;
        })
      );
    });
  }, []);

  return {
    proposals,
    progress,
    error,
    isSearching,
    isProviderReady: providerReady,
    cacheInfo,
  };
}
