"use client";

/**
 * Hook for searching and filtering delegates from the cache
 * Provides delegate list with filtering, pagination, and live refresh
 */

import { ethers } from "ethers";
import { useCallback, useEffect, useRef, useState } from "react";

import { ARBITRUM_RPC_URL, ARB_TOKEN } from "@/config/arbitrum-governance";
import { STORAGE_KEYS } from "@/config/storage-keys";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { addressesEqual } from "@/lib/address-utils";
import { debug } from "@/lib/debug";
import { getDelegateCacheStats, loadDelegateCache } from "@/lib/delegate-cache";
import { toError } from "@/lib/error-utils";
import { createRpcProvider } from "@/lib/rpc-utils";
import type {
  DelegateCache,
  DelegateCacheStats,
  DelegateInfo,
} from "@/types/delegate";
import ERC20Votes_ABI from "@data/ERC20Votes_ABI.json";

/** Options for configuring delegate search */
export interface UseDelegateSearchOptions {
  enabled: boolean;
  customRpcUrl?: string;
  minVotingPower?: string;
  addressFilter?: string;
}

/** Return type for useDelegateSearch hook */
export interface UseDelegateSearchResult {
  /** Filtered list of delegates */
  delegates: DelegateInfo[];
  /** Total voting power of all delegates */
  totalVotingPower: string;
  /** Total ARB token supply */
  totalSupply: string;
  /** Error if loading failed */
  error: Error | null;
  /** Whether initial load is in progress */
  isLoading: boolean;
  /** Cache statistics */
  cacheStats?: DelegateCacheStats;
  /** Block number of cache snapshot */
  snapshotBlock: number;
  /** Function to refresh voting power for visible delegates */
  refreshVisibleDelegates: (addresses: string[]) => Promise<void>;
  /** Whether visible delegates are being refreshed */
  isRefreshingVisible: boolean;
}

/**
 * Filter delegates by minimum voting power and/or address search term
 * @param delegates - Array of delegates to filter
 * @param options - Filter options
 * @returns Filtered delegate array
 */
export function filterDelegates(
  delegates: DelegateInfo[],
  options: {
    minVotingPower?: string;
    addressFilter?: string;
  }
): DelegateInfo[] {
  let filtered = delegates;

  if (options.minVotingPower) {
    const minPower = BigInt(options.minVotingPower);
    filtered = filtered.filter((d) => BigInt(d.votingPower) >= minPower);
  }

  if (options.addressFilter && options.addressFilter.trim()) {
    const searchTerm = options.addressFilter.toLowerCase().trim();
    filtered = filtered.filter((d) =>
      d.address.toLowerCase().includes(searchTerm)
    );
  }

  return filtered;
}

/**
 * Hook for searching delegates with filtering and live updates
 * @param options - Search options including filters and RPC URL
 * @returns Delegate list, statistics, and refresh functions
 */
export function useDelegateSearch({
  enabled,
  customRpcUrl,
  minVotingPower,
  addressFilter,
}: UseDelegateSearchOptions): UseDelegateSearchResult {
  const [storedL2Rpc, , l2RpcHydrated] = useLocalStorage(
    STORAGE_KEYS.L2_RPC,
    ""
  );

  const [delegates, setDelegates] = useState<DelegateInfo[]>([]);
  const [totalVotingPower, setTotalVotingPower] = useState<string>("0");
  const [totalSupply, setTotalSupply] = useState<string>("0");
  const [snapshotBlock, setSnapshotBlock] = useState<number>(0);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshingVisible, setIsRefreshingVisible] = useState(false);
  const [cacheStats, setCacheStats] = useState<DelegateCacheStats>();
  const [cache, setCache] = useState<DelegateCache | null>(null);

  const refreshedAddresses = useRef<Set<string>>(new Set());

  const rpcUrl = customRpcUrl || storedL2Rpc || ARBITRUM_RPC_URL;

  // Load cache on mount - filters are applied in a separate effect
  useEffect(() => {
    let cancelled = false;

    setIsLoading(true);
    setError(null);

    loadDelegateCache()
      .then((loaded) => {
        if (cancelled) return;

        if (loaded) {
          setCache(loaded);
          setTotalVotingPower(loaded.totalVotingPower);
          setTotalSupply(loaded.totalSupply);
          setSnapshotBlock(loaded.snapshotBlock);
          setCacheStats(getDelegateCacheStats(loaded));
          debug.delegates(
            "cache loaded: %d delegates (block %d)",
            loaded.delegates.length,
            loaded.snapshotBlock
          );
        }
        setIsLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        debug.delegates("failed to load cache: %O", err);
        setError(toError(err));
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Apply filters when they change
  useEffect(() => {
    if (cache) {
      const filtered = filterDelegates(cache.delegates, {
        minVotingPower,
        addressFilter,
      });
      setDelegates(filtered);
    }
  }, [minVotingPower, addressFilter, cache]);

  const refreshVisibleDelegates = useCallback(
    async (addresses: string[]) => {
      if (!enabled || !l2RpcHydrated || addresses.length === 0) return;

      const toRefresh = addresses.filter(
        (addr) => !refreshedAddresses.current.has(addr.toLowerCase())
      );

      if (toRefresh.length === 0) return;

      setIsRefreshingVisible(true);

      try {
        const provider = await createRpcProvider(rpcUrl);

        const contract = new ethers.Contract(
          ARB_TOKEN.address,
          ERC20Votes_ABI,
          provider
        );

        const refreshPromises = toRefresh.map(async (address) => {
          try {
            const votes = await contract.getCurrentVotes(address);
            refreshedAddresses.current.add(address.toLowerCase());
            return { address, votingPower: votes.toString() };
          } catch (err) {
            debug.delegates(
              "failed to refresh voting power for %s: %O",
              address,
              err
            );
            return null;
          }
        });

        const results = await Promise.all(refreshPromises);
        const successfulResults = results.filter(
          (r): r is { address: string; votingPower: string } => r !== null
        );

        if (successfulResults.length > 0 && cache) {
          const updatedDelegates = cache.delegates.map((d) => {
            const refreshed = successfulResults.find((r) =>
              addressesEqual(r.address, d.address)
            );
            return refreshed ? { ...d, votingPower: refreshed.votingPower } : d;
          });

          updatedDelegates.sort((a, b) => {
            const diff = BigInt(b.votingPower) - BigInt(a.votingPower);
            return diff > BigInt(0) ? 1 : diff < BigInt(0) ? -1 : 0;
          });

          const newCache = { ...cache, delegates: updatedDelegates };
          setCache(newCache);

          const filtered = filterDelegates(updatedDelegates, {
            minVotingPower,
            addressFilter,
          });
          setDelegates(filtered);

          const newTotalVotingPower = updatedDelegates
            .reduce((sum, d) => sum + BigInt(d.votingPower), BigInt(0))
            .toString();
          setTotalVotingPower(newTotalVotingPower);
        }
      } catch (err) {
        debug.delegates("error refreshing visible delegates: %O", err);
      } finally {
        setIsRefreshingVisible(false);
      }
    },
    [enabled, l2RpcHydrated, rpcUrl, cache, minVotingPower, addressFilter]
  );

  return {
    delegates,
    totalVotingPower,
    totalSupply,
    error,
    isLoading,
    cacheStats,
    snapshotBlock,
    refreshVisibleDelegates,
    isRefreshingVisible,
  };
}
