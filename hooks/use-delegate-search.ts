"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  filterDelegatesByAddress,
  filterDelegatesByMinPower,
  queryDelegateVotingPowers,
  type DelegateInfo,
} from "@gzeoneth/gov-tracker";

import { useRpcSettings } from "@/hooks/use-rpc-settings";
import { compareBigIntDesc } from "@/lib/collection-utils";
import { debug } from "@/lib/debug";
import { toError } from "@/lib/error-utils";
import { formatCacheAge } from "@/lib/format-utils";
import { createRpcProvider } from "@/lib/rpc-utils";
import { getTallyDataClient } from "@/lib/tally-data/client";
import type { TallyDelegateListItem } from "@/lib/tally-data/types";
import type { DelegateCacheStats } from "@/types/delegate";

const DEFAULT_MIN_VOTING_POWER = "10000000000000000000";

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

type DelegateData = {
  delegates: TallyDelegateListItem[];
  totalVotingPower: string;
  totalSupply: string;
};

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

function delegateMatchesSearch(
  delegate: TallyDelegateListItem,
  rawFilter: string
): boolean {
  const filter = rawFilter.trim().toLowerCase();
  if (!filter) return true;

  return [
    delegate.address,
    delegate.displayName,
    delegate.knownLabel,
    delegate.name,
    delegate.ens,
  ].some((value) => value?.toLowerCase().includes(filter));
}

export function useDelegateSearch({
  enabled,
  customRpcUrl,
  minVotingPower,
  addressFilter,
}: UseDelegateSearchOptions): UseDelegateSearchResult {
  const { l2Rpc, isHydrated } = useRpcSettings({ customL2Rpc: customRpcUrl });
  const [debouncedAddressFilter, setDebouncedAddressFilter] = useState(
    addressFilter ?? ""
  );

  const [delegates, setDelegates] = useState<DelegateInfo[]>([]);
  const [totalVotingPower, setTotalVotingPower] = useState<string>("0");
  const [totalSupply, setTotalSupply] = useState<string>("0");
  const [snapshotBlock, setSnapshotBlock] = useState<number>(0);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshingVisible, setIsRefreshingVisible] = useState(false);
  const [cacheStats, setCacheStats] = useState<DelegateCacheStats>();
  const [delegateData, setDelegateData] = useState<DelegateData | null>(null);

  const refreshedAddresses = useRef<Set<string>>(new Set());

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedAddressFilter(addressFilter ?? "");
    }, 250);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [addressFilter]);

  useEffect(() => {
    let cancelled = false;

    setIsLoading(true);
    setError(null);

    getTallyDataClient()
      .getDelegateList(DEFAULT_MIN_VOTING_POWER)
      .then((loaded) => {
        if (cancelled) return;

        if (loaded) {
          setDelegateData(loaded);
          setTotalVotingPower(loaded.totalVotingPower);
          setTotalSupply(loaded.totalSupply);
          setSnapshotBlock(0);
          setCacheStats({
            totalDelegates: loaded.delegates.length,
            snapshotBlock: 0,
            generatedAt: new Date(),
            age: formatCacheAge(new Date()),
            totalVotingPower: loaded.totalVotingPower,
            totalSupply: loaded.totalSupply,
          });
          debug.delegates(
            "SQLite delegate list loaded: %d delegates",
            loaded.delegates.length
          );
        }
        setIsLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        debug.delegates("failed to load SQLite delegate list: %O", err);
        setError(toError(err));
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function filterFromCache() {
      if (!delegateData) return;

      const baseDelegates = filterDelegates(delegateData.delegates, {
        minVotingPower,
      }) as TallyDelegateListItem[];

      const trimmedFilter = debouncedAddressFilter.trim();
      if (!trimmedFilter) {
        setDelegates(baseDelegates);
        return;
      }

      setDelegates(
        baseDelegates.filter((delegate) =>
          delegateMatchesSearch(delegate, trimmedFilter)
        )
      );
    }

    filterFromCache();
  }, [minVotingPower, debouncedAddressFilter, delegateData]);

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

        if (powerMap.size > 0 && delegateData) {
          const updatedDelegates = delegateData.delegates.map((d) => {
            const newPower = powerMap.get(d.address.toLowerCase());
            return newPower ? { ...d, votingPower: newPower } : d;
          });

          updatedDelegates.sort((a, b) =>
            compareBigIntDesc(a.votingPower, b.votingPower)
          );

          const newDelegateData = {
            ...delegateData,
            delegates: updatedDelegates,
          };
          setDelegateData(newDelegateData);

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
    [enabled, isHydrated, l2Rpc, delegateData]
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
