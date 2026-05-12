"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  filterDelegatesByAddress,
  filterDelegatesByMinPower,
  queryDelegateVotingPowers,
  type DelegateInfo,
} from "@gzeoneth/gov-tracker";

import { useRpcSettings } from "@/hooks/use-rpc-settings";
import { debug } from "@/lib/debug";
import {
  delegateMatchesSearch,
  getDelegateListStats,
  loadDelegateList,
  type TallyDelegateListItem,
  type TallyDelegateListResult,
} from "@/lib/delegate-data";
import { toError } from "@/lib/error-utils";
import { createRpcProvider } from "@/lib/rpc-utils";
import type { DelegateCacheStats } from "@/types/delegate";

// Must match `MIN_DELEGATE_POWER_WEI` in components/container/DelegateSearch.tsx
// (5000 ARB * 10^18). The UI enforces this floor; pushing it into the SQL
// query keeps the local cache consistent with what the UI accepts.
const MIN_DELEGATE_POWER_WEI = "5000000000000000000000";

export interface UseDelegateSearchOptions {
  enabled: boolean;
  customRpcUrl?: string;
  minVotingPower?: string;
  addressFilter?: string;
}

export interface UseDelegateSearchResult {
  delegates: TallyDelegateListItem[];
  totalVotingPower: string;
  totalSupply: string;
  error: Error | null;
  isLoading: boolean;
  cacheStats?: DelegateCacheStats;
  snapshotBlock: number;
  refreshVisibleDelegates: (addresses: string[]) => Promise<void>;
  isRefreshingVisible: boolean;
  refreshedAddresses: Set<string>;
}

// `filterDelegates` is generic so callers can apply the same filter logic to
// either gov-tracker's `DelegateInfo` or our richer `TallyDelegateListItem`
// shape. Both expose `address` and `votingPower`, which is all the gov-tracker
// helpers actually read.
export function filterDelegates<
  T extends { address: string; votingPower: string },
>(
  delegates: T[],
  options: {
    minVotingPower?: string;
    addressFilter?: string;
  }
): T[] {
  let result = delegates;
  if (options.minVotingPower) {
    result = filterDelegatesByMinPower(
      result as unknown as DelegateInfo[],
      options.minVotingPower
    ) as unknown as T[];
  }
  const trimmedAddress = options.addressFilter?.trim();
  if (trimmedAddress) {
    result = filterDelegatesByAddress(
      result as unknown as DelegateInfo[],
      trimmedAddress
    ) as unknown as T[];
  }
  return result;
}

export function sortDelegatesByVotingPower<T extends { votingPower: string }>(
  delegates: T[]
): T[] {
  return [...delegates].sort((a, b) => {
    const aPower = BigInt(a.votingPower);
    const bPower = BigInt(b.votingPower);
    if (aPower > bPower) return -1;
    if (aPower < bPower) return 1;
    return 0;
  });
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

  const [delegates, setDelegates] = useState<TallyDelegateListItem[]>([]);
  const [totalVotingPower, setTotalVotingPower] = useState<string>("0");
  const [totalSupply, setTotalSupply] = useState<string>("0");
  const [snapshotBlock, setSnapshotBlock] = useState<number>(0);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshingVisible, setIsRefreshingVisible] = useState(false);
  const [cacheStats, setCacheStats] = useState<DelegateCacheStats>();
  const [delegateData, setDelegateData] =
    useState<TallyDelegateListResult | null>(null);

  const refreshedAddressesRef = useRef<Set<string>>(new Set());
  const [refreshedAddresses, setRefreshedAddresses] = useState<Set<string>>(
    () => new Set()
  );

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

    loadDelegateList(MIN_DELEGATE_POWER_WEI)
      .then((loaded) => {
        if (cancelled) return;

        if (loaded) {
          // SQLite already returns delegates ordered by rank
          // (voting-power desc), so no resort is needed on load.
          setDelegateData(loaded);
          setTotalVotingPower(loaded.totalVotingPower);
          setTotalSupply(loaded.totalSupply);
          setSnapshotBlock(0);
          setCacheStats(getDelegateListStats(loaded));
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
      });

      const trimmedFilter = debouncedAddressFilter.trim();
      const filtered = trimmedFilter
        ? baseDelegates.filter((delegate) =>
            delegateMatchesSearch(delegate, trimmedFilter)
          )
        : baseDelegates;

      // Preserve SQLite's voting-power-desc order. refreshVisibleDelegates
      // sorts within the refreshed subset's original indices; sorting here
      // would cause cascading reorders across pages.
      setDelegates(filtered);
    }

    filterFromCache();
  }, [minVotingPower, debouncedAddressFilter, delegateData]);

  const refreshVisibleDelegates = useCallback(
    async (addresses: string[]) => {
      if (!enabled || !isHydrated || addresses.length === 0) return;

      const toRefresh = addresses.filter(
        (addr) => !refreshedAddressesRef.current.has(addr.toLowerCase())
      );

      if (toRefresh.length === 0) return;

      setIsRefreshingVisible(true);

      try {
        const provider = await createRpcProvider(l2Rpc);
        const powerMap = await queryDelegateVotingPowers(provider, toRefresh);

        const newlyRefreshed: string[] = [];
        for (const addr of toRefresh) {
          const lower = addr.toLowerCase();
          if (
            powerMap.has(lower) &&
            !refreshedAddressesRef.current.has(lower)
          ) {
            refreshedAddressesRef.current.add(lower);
            newlyRefreshed.push(lower);
          }
        }

        if (newlyRefreshed.length > 0) {
          setRefreshedAddresses((current) => {
            const next = new Set(current);
            for (const addr of newlyRefreshed) next.add(addr);
            return next;
          });
        }

        if (powerMap.size > 0 && delegateData) {
          // Update fresh values in place, then sort just the refreshed subset
          // within its original indices. This reorders only the rows we just
          // fetched (typically the visible page) using fresh on-chain values
          // without shifting rows on other pages.
          //
          // Track the on-chain delta against build-time voting power so the
          // headline total stays anchored to the manifest's full-set sum
          // (every delegate >=1 ARB) rather than collapsing to a sum across
          // the filtered/visible subset.
          let powerDelta = BigInt(0);
          const refreshedIndices: number[] = [];
          const refreshedObjects: TallyDelegateListItem[] = [];
          const updatedDelegates = delegateData.delegates.map((d, i) => {
            const newPower = powerMap.get(d.address.toLowerCase());
            if (!newPower) return d;

            powerDelta += BigInt(newPower) - BigInt(d.votingPower);
            const updated = { ...d, votingPower: newPower };
            refreshedIndices.push(i);
            refreshedObjects.push(updated);
            return updated;
          });

          const sortedSubset = sortDelegatesByVotingPower(refreshedObjects);
          refreshedIndices.forEach((idx, k) => {
            updatedDelegates[idx] = sortedSubset[k];
          });

          const newTotalVotingPower =
            powerDelta === BigInt(0)
              ? delegateData.totalVotingPower
              : (BigInt(delegateData.totalVotingPower) + powerDelta).toString();

          setDelegateData({
            ...delegateData,
            delegates: updatedDelegates,
            totalVotingPower: newTotalVotingPower,
          });
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
    refreshedAddresses,
  };
}
