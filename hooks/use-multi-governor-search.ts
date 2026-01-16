"use client";

/**
 * Hook for searching proposals across multiple governors
 */

import { useEffect, useState } from "react";

import {
  extractProposalsFromBundledCache,
  getBundledCacheWatermark,
} from "@/lib/bundled-cache-loader";
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

        // Calculate search range based on days
        const blocksToSearch = BLOCKS_PER_DAY.arbitrum * daysToSearch;
        const userStartBlock = Math.max(currentBlock - blocksToSearch, 0);

        setProgress(5);
        if (cancelled || abortController.signal.aborted) return;

        // Extract proposals directly from bundled cache (no RPC calls)
        const [{ proposals: cachedProposals, activeProposalIds }, watermark] =
          await Promise.all([
            extractProposalsFromBundledCache(),
            getBundledCacheWatermark(),
          ]);

        setProgress(10);
        if (cancelled || abortController.signal.aborted) return;

        const allProposals: ParsedProposal[] = [...cachedProposals];
        const cachedCount = cachedProposals.length;
        let cacheWatermarkBlock = watermark?.l2Block ?? 0;

        debug.search(
          "extracted %d proposals from cache (%d active)",
          cachedCount,
          activeProposalIds.size
        );

        // Refresh state/votes only for active proposals
        if (activeProposalIds.size > 0) {
          const activeProposals = allProposals.filter((p) =>
            activeProposalIds.has(p.id)
          );
          debug.search(
            "refreshing %d active proposals",
            activeProposals.length
          );

          const refreshed = await refreshProposalStates(
            provider,
            activeProposals
          );

          // Update the proposals with refreshed data
          const refreshedMap = new Map(refreshed.map((p) => [p.id, p]));
          for (let i = 0; i < allProposals.length; i++) {
            const updated = refreshedMap.get(allProposals[i].id);
            if (updated) {
              allProposals[i] = updated;
            }
          }
        }

        setProgress(30);
        if (cancelled || abortController.signal.aborted) return;

        // Determine the starting block for fresh RPC search
        if (watermark) {
          debug.search(
            "bundled cache watermark at L2 block %d",
            cacheWatermarkBlock
          );
        }

        // Only scan blocks after the watermark (or from userStartBlock if no watermark)
        const rpcStartBlock = watermark
          ? Math.max(cacheWatermarkBlock + 1, userStartBlock)
          : userStartBlock;

        let freshCount = 0;

        // Skip RPC search if watermark covers our search range
        if (rpcStartBlock < currentBlock) {
          debug.search(
            "searching RPC blocks %d to %d",
            rpcStartBlock,
            currentBlock
          );

          const totalGovernors = ARBITRUM_GOVERNORS.length;
          let completedQueries = 0;

          for (const governor of ARBITRUM_GOVERNORS) {
            if (abortController.signal.aborted) break;

            const rawProposals = await searchGovernor(
              provider,
              governor.address,
              rpcStartBlock,
              currentBlock,
              blockRange,
              () => {}
            );

            completedQueries++;
            if (!cancelled) {
              const searchProgress =
                30 + (completedQueries / totalGovernors) * 50;
              setProgress(searchProgress);
            }

            if (rawProposals.length > 0) {
              const parsed = await parseProposals(provider, rawProposals);
              // Deduplicate: only add proposals not already in cached set
              const existingIds = new Set(allProposals.map((p) => p.id));
              for (const p of parsed) {
                if (!existingIds.has(p.id)) {
                  allProposals.push(p);
                  freshCount++;
                }
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

        if (cancelled || abortController.signal.aborted) return;

        // Sort: active first, then by startBlock descending
        setProposals(sortProposals(allProposals));
        setCacheInfo({
          loaded: cachedCount > 0,
          snapshotBlock: cacheWatermarkBlock,
          cacheStartBlock: 0,
          cachedCount,
          freshCount,
          cacheUsed: cachedCount > 0,
          rangeInfo:
            cachedCount > 0
              ? `Cache: ${cachedCount} + RPC: ${rpcStartBlock} → ${currentBlock}`
              : `RPC: ${rpcStartBlock} → ${currentBlock}`,
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
