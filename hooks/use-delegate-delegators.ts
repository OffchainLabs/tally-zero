"use client";

import { useInfiniteQuery } from "@tanstack/react-query";

import {
  getDelegatorsPage,
  getFormerDelegatorsPage,
} from "@/lib/delegate-cache";

export const DELEGATORS_PAGE_SIZE = 25;

// The indexer rebuilds each delegate's list every five minutes; refetching
// sooner only re-reads its cache.
const STALE_TIME_MS = 5 * 60 * 1000;

type Page = { totalCount: number; delegators: unknown[] };

/** The offset of the next page, or undefined once every row is loaded. */
export function nextDelegatorsOffset(pages: Page[]): number | undefined {
  const last = pages[pages.length - 1];
  if (!last || last.delegators.length === 0) return undefined;
  const loaded = pages.reduce((sum, page) => sum + page.delegators.length, 0);
  return loaded < last.totalCount ? loaded : undefined;
}

/**
 * Pages are offsets into a list the indexer re-sorts when it rebuilds, so a
 * row can move across a page boundary between two fetches. Keep the first
 * occurrence of each address.
 */
export function uniqueByAddress<T extends { address: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = row.address.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function useCurrentDelegators(address: string) {
  const normalized = address.toLowerCase();
  return useInfiniteQuery({
    queryKey: ["delegate-delegators", "current", normalized],
    queryFn: ({ pageParam }) =>
      getDelegatorsPage(normalized, pageParam, DELEGATORS_PAGE_SIZE),
    initialPageParam: 0,
    getNextPageParam: (_last, pages) => nextDelegatorsOffset(pages),
    staleTime: STALE_TIME_MS,
  });
}

export function useFormerDelegators(address: string) {
  const normalized = address.toLowerCase();
  return useInfiniteQuery({
    queryKey: ["delegate-delegators", "former", normalized],
    queryFn: ({ pageParam }) =>
      getFormerDelegatorsPage(normalized, pageParam, DELEGATORS_PAGE_SIZE),
    initialPageParam: 0,
    getNextPageParam: (_last, pages) => nextDelegatorsOffset(pages),
    staleTime: STALE_TIME_MS,
  });
}
