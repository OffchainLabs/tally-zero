"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  filterDelegatesByAddress,
  filterDelegatesByMinPower,
  queryDelegateVotingPowers,
  type DelegateCache,
  type DelegateInfo,
} from "@gzeoneth/gov-tracker";

import { useRpcSettings } from "@/hooks/use-rpc-settings";
import { compareBigIntDesc } from "@/lib/collection-utils";
import { debug } from "@/lib/debug";
import { getDelegateCacheStats, loadDelegateCache } from "@/lib/delegate-cache";
import { toError } from "@/lib/error-utils";
import { createRpcProvider } from "@/lib/rpc-utils";
import type { DelegateCacheStats } from "@/types/delegate";

export interface UseDelegateSearchOptions {
  enabled: boolean;
  customRpcUrl?: string;
  minVotingPower?: string;
  addressFilter?: string;
}

export interface UseDelegateSearchResult {
  delegates: DelegateInfo[];
  totalVotingPower: string;
  totalSupply: string;
  error: Error | null;
  isLoading: boolean;
  cacheStats?: DelegateCacheStats;
  snapshotBlock: number;
  refreshVisibleDelegates: (addresses: string[]) => Promise<void>;
  isRefreshingVisible: boolean;
}

export function filterDelegates(
  delegates: DelegateInfo[],
  options: {
    minVotingPower?: string;
    addressFilter?: string;
  }
): DelegateInfo[] {
  let result = delegates;
  if (options.minVotingPower) {
    result = filterDelegatesByMinPower(result, options.minVotingPower);
  }
  const trimmedAddress = options.addressFilter?.trim();
  if (trimmedAddress) {
    result = filterDelegatesByAddress(result, trimmedAddress);
  }
  return result;
}

export function useDelegateSearch({
  enabled,
  customRpcUrl,
  minVotingPower,
  addressFilter,
}: UseDelegateSearchOptions): UseDelegateSearchResult {
  const { l2Rpc, isHydrated } = useRpcSettings({ customL2Rpc: customRpcUrl });

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
      if (!enabled || !isHydrated || addresses.length === 0) return;

      const toRefresh = addresses.filter(
        (addr) => !refreshedAddresses.current.has(addr.toLowerCase())
      );

      if (toRefresh.length === 0) return;

      setIsRefreshingVisible(true);

      try {
        const provider = await createRpcProvider(l2Rpc);
        const powerMap = await queryDelegateVotingPowers(provider, toRefresh);

        for (const addr of toRefresh) {
          if (powerMap.has(addr.toLowerCase())) {
            refreshedAddresses.current.add(addr.toLowerCase());
          }
        }

        if (powerMap.size > 0 && cache) {
          const updatedDelegates = cache.delegates.map((d) => {
            const newPower = powerMap.get(d.address.toLowerCase());
            return newPower ? { ...d, votingPower: newPower } : d;
          });

          updatedDelegates.sort((a, b) =>
            compareBigIntDesc(a.votingPower, b.votingPower)
          );

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
    [enabled, isHydrated, l2Rpc, cache, minVotingPower, addressFilter]
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
