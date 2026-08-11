"use client";

import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { SortingState } from "@tanstack/react-table";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  filterDelegatesByAddress,
  filterDelegatesByMinPower,
  queryDelegateVotingPowers,
  type DelegateInfo,
} from "@gzeoneth/gov-tracker";

import { EXCLUDED_DELEGATE_ADDRESSES } from "@/config/delegates";
import { delegateVotingPowerKey } from "@/hooks/use-delegate-voting-power";
import { useRpcSettings } from "@/hooks/use-rpc-settings";
import { debug } from "@/lib/debug";
import { toError } from "@/lib/error-utils";
import { createRpcProvider } from "@/lib/rpc-utils";
import { getTallyDataClient } from "@/lib/tally-data/client";
import type {
  DelegateSortField,
  TallyDelegateListItem,
} from "@/lib/tally-data/types";
import {
  TOTAL_VOTING_POWER_REVALIDATE_SECONDS,
  type TotalVotingPowerSnapshot,
} from "@/lib/total-voting-power";

/** Default rows per page for the server-paginated delegate table. */
export const DELEGATE_PAGE_SIZE = 20;

/** Toolbar order modes: ranked by voting power, or a seeded shuffle. */
export type DelegateSortOrder = "votingPower" | "random";

// Map a TanStack column id to the indexer's sort field (percentage is derived
// from voting power, so it orders the same).
function columnToSortField(columnId: string): DelegateSortField {
  return columnId === "address" ? "address" : "votingPower";
}

// Applied server-side (list + count) so pages and the total stay mutually
// consistent; a spread copy because the config export is a readonly tuple.
const EXCLUDE = [...EXCLUDED_DELEGATE_ADDRESSES];

/**
 * Match the server's refresh interval: the route serves an hour-old snapshot,
 * so refetching sooner would only re-download the same number.
 */
const TOTAL_VOTING_POWER_FRESH_MS =
  TOTAL_VOTING_POWER_REVALIDATE_SECONDS * 1000;

export interface UseDelegateSearchOptions {
  enabled: boolean;
  customRpcUrl?: string;
  minVotingPower?: string;
  addressFilter?: string;
}

export interface UseDelegateSearchResult {
  delegates: DelegateInfo[];
  /**
   * Size of the eligible delegate population for the active filters, from the
   * dedicated count endpoint — independent of the current page.
   */
  eligibleDelegateCount: number;
  /**
   * Delegated voting power of the whole DAO: the ARB token's
   * `getTotalDelegation()` minus the exclude address's `getVotes`, read and
   * cached hourly by the server so every user sees the same figure. Falls back
   * to the indexer's sum until (or unless) that fetch succeeds.
   */
  totalVotingPower: string;
  totalSupply: string;
  error: Error | null;
  isLoading: boolean;
  pageIndex: number;
  pageSize: number;
  rowCount: number;
  setPagination: (pagination: { pageIndex: number; pageSize: number }) => void;
  sorting: SortingState;
  setSorting: (sorting: SortingState) => void;
  sortOrder: DelegateSortOrder;
  setSortOrder: (order: DelegateSortOrder) => void;
  refreshVisibleDelegates: (addresses: string[]) => Promise<void>;
  isRefreshingVisible: boolean;
  refreshedAddresses: Set<string>;
}

export function delegatesPageKey(
  query: string,
  minVotingPower: string,
  pageIndex: number,
  pageSize: number,
  sort: string,
  dir: string,
  seed: string
) {
  return [
    "delegates-page",
    { query, minVotingPower, pageIndex, pageSize, sort, dir, seed },
  ] as const;
}

export function delegatesCountKey(query: string, minVotingPower: string) {
  return ["delegates-count", { query, minVotingPower }] as const;
}

/**
 * Key for the delegated-voting-power total. No filter or RPC in it: the figure
 * is the whole DAO's delegated power, computed server-side, and is therefore
 * the same for every user and every page of the table.
 */
export function totalVotingPowerKey() {
  return ["arb-total-voting-power"] as const;
}

/**
 * Fetch the DAO's delegated voting power from our own server, which reads it
 * from the ARB token and caches it for an hour on everyone's behalf.
 */
async function fetchTotalVotingPower(): Promise<string> {
  const response = await fetch("/api/total-voting-power", {
    headers: { accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Total voting power request failed: ${response.status}`);
  }
  const snapshot = (await response.json()) as TotalVotingPowerSnapshot;
  return snapshot.totalVotingPower;
}

// Retained pure helpers (unit-tested in use-delegate-search.test.ts). No longer
// used by the hook itself now that filtering happens server-side.
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
  minVotingPower = "0",
  addressFilter,
}: UseDelegateSearchOptions): UseDelegateSearchResult {
  const { l2Rpc, isHydrated } = useRpcSettings({ customL2Rpc: customRpcUrl });
  const queryClient = useQueryClient();
  const client = useMemo(() => getTallyDataClient(), []);

  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(DELEGATE_PAGE_SIZE);
  const [debouncedQuery, setDebouncedQuery] = useState(
    (addressFilter ?? "").trim()
  );

  // Sort: a "Voting Power" vs "Random" toolbar mode plus optional column-header
  // sorting; both resolve to an indexer order below. `random` carries a seed so
  // the shuffle is stable across pages until the user re-selects it.
  const [sortOrder, setSortOrderState] =
    useState<DelegateSortOrder>("votingPower");
  const [sorting, setSorting] = useState<SortingState>([]);
  const [randomSeed, setRandomSeed] = useState("");

  const { sort, dir, seed } = useMemo(() => {
    if (sortOrder === "random") {
      return {
        sort: "random" as DelegateSortField,
        dir: "desc",
        seed: randomSeed,
      };
    }
    const active = sorting[0];
    if (!active) {
      return {
        sort: "votingPower" as DelegateSortField,
        dir: "desc",
        seed: "",
      };
    }
    return {
      sort: columnToSortField(active.id),
      dir: active.desc ? "desc" : "asc",
      seed: "",
    };
  }, [sortOrder, sorting, randomSeed]);

  const setSortOrder = useCallback((order: DelegateSortOrder) => {
    if (order === "random") {
      // A new seed each time Random is (re)selected → a fresh shuffle.
      setRandomSeed(`${Math.floor(Math.random() * 1_000_000_000)}`);
    }
    setSortOrderState(order);
  }, []);

  // On-chain voting-power overlay for the visible page: refreshedAddresses gates
  // the row out of its skeleton, refreshedPowers supplies the fresh value.
  const refreshedAddressesRef = useRef<Set<string>>(new Set());
  const [refreshedAddresses, setRefreshedAddresses] = useState<Set<string>>(
    () => new Set()
  );
  const [refreshedPowers, setRefreshedPowers] = useState<Map<string, string>>(
    () => new Map()
  );
  const [isRefreshingVisible, setIsRefreshingVisible] = useState(false);

  // Debounce the search box before it drives a server fetch.
  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedQuery((addressFilter ?? "").trim());
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [addressFilter]);

  // Any filter or sort change resets to the first page.
  useEffect(() => {
    setPageIndex(0);
  }, [debouncedQuery, minVotingPower, sort, dir, seed]);

  const pageQuery = useQuery({
    queryKey: delegatesPageKey(
      debouncedQuery,
      minVotingPower,
      pageIndex,
      pageSize,
      sort,
      dir,
      seed
    ),
    queryFn: () =>
      client.getDelegatesPage({
        minVotingPower,
        query: debouncedQuery || undefined,
        exclude: EXCLUDE,
        limit: pageSize,
        offset: pageIndex * pageSize,
        sort,
        dir: dir as "asc" | "desc",
        seed: seed || undefined,
      }),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  const countQuery = useQuery({
    queryKey: delegatesCountKey(debouncedQuery, minVotingPower),
    queryFn: () =>
      client.getDelegateCount({
        minVotingPower,
        query: debouncedQuery || undefined,
        exclude: EXCLUDE,
      }),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  // Delegated voting power straight from the token, so the total (and every
  // "% of total" derived from it) reflects the chain rather than the indexer's
  // filter-scoped sum. Ungated, like the two indexer queries above: it hits our
  // own server rather than the user's RPC, so the RPC-health gate that guards
  // `refreshVisibleDelegates` would only withhold a figure we can always serve.
  const totalVotingPowerQuery = useQuery({
    queryKey: totalVotingPowerKey(),
    queryFn: fetchTotalVotingPower,
    staleTime: TOTAL_VOTING_POWER_FRESH_MS,
    gcTime: TOTAL_VOTING_POWER_FRESH_MS,
  });

  // The server already orders by voting power desc; overlay any refreshed
  // on-chain powers so the visible rows show live values.
  const delegates = useMemo<DelegateInfo[]>(() => {
    const rows = (pageQuery.data?.delegates ?? []) as TallyDelegateListItem[];
    const overlaid = rows.map((row) => {
      const power = refreshedPowers.get(row.address.toLowerCase());
      return power ? { ...row, votingPower: power } : row;
    });
    return overlaid as unknown as DelegateInfo[];
  }, [pageQuery.data, refreshedPowers]);

  const rawError = pageQuery.error ?? countQuery.error;
  const error = rawError ? toError(rawError) : null;

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

        // Seed the shared cache so the delegate profile reuses these live
        // on-chain values instead of re-querying the chain per address.
        for (const [addr, power] of powerMap) {
          queryClient.setQueryData(delegateVotingPowerKey(addr, l2Rpc), power);
        }

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

        if (powerMap.size > 0) {
          setRefreshedPowers((current) => {
            const next = new Map(current);
            for (const [addr, power] of powerMap) {
              next.set(addr.toLowerCase(), power);
            }
            return next;
          });
        }
        if (newlyRefreshed.length > 0) {
          setRefreshedAddresses((current) => {
            const next = new Set(current);
            for (const addr of newlyRefreshed) next.add(addr);
            return next;
          });
        }
      } catch (err) {
        debug.delegates("error refreshing visible delegates: %O", err);
      } finally {
        setIsRefreshingVisible(false);
      }
    },
    [enabled, isHydrated, l2Rpc, queryClient]
  );

  const setPagination = useCallback(
    (pagination: { pageIndex: number; pageSize: number }) => {
      setPageIndex(pagination.pageIndex);
      setPageSize(pagination.pageSize);
    },
    []
  );

  return {
    delegates,
    eligibleDelegateCount: countQuery.data?.totalCount ?? 0,
    totalVotingPower: totalVotingPowerQuery.data ?? "0",
    totalSupply: countQuery.data?.totalSupply ?? "0",
    error,
    isLoading: pageQuery.isLoading || countQuery.isLoading,
    pageIndex,
    pageSize,
    rowCount: countQuery.data?.totalCount ?? 0,
    setPagination,
    sorting,
    setSorting,
    sortOrder,
    setSortOrder,
    refreshVisibleDelegates,
    isRefreshingVisible,
    refreshedAddresses,
  };
}
