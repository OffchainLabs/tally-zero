import "server-only";

import type { DelegateInfo } from "@gzeoneth/gov-tracker";
import { unstable_cache } from "next/cache";

import {
  DELEGATE_MIN_VOTING_POWER_WEI,
  EXCLUDED_DELEGATE_ADDRESSES,
} from "@/config/delegates";
import { debug } from "@/lib/debug";
import { indexerFetch } from "@/lib/indexer/server";
import type { TallyDelegateListResult } from "@/lib/tally-data/types";
import {
  TOP_DELEGATES_CANDIDATE_LIMIT,
  TOP_DELEGATES_REVALIDATE_SECONDS,
  type TopDelegatesSnapshot,
} from "@/lib/top-delegates";

/**
 * Read the top candidates from the indexer with the same filter the delegates
 * tab uses, keeping only the three fields the SDK's cache shape needs.
 */
export async function fetchTopDelegatesFromIndexer(): Promise<TopDelegatesSnapshot> {
  const search = new URLSearchParams({
    minVotingPower: DELEGATE_MIN_VOTING_POWER_WEI,
    exclude: EXCLUDED_DELEGATE_ADDRESSES.join(","),
    limit: String(TOP_DELEGATES_CANDIDATE_LIMIT),
    offset: "0",
    sort: "votingPower",
    dir: "desc",
  });

  const upstream = await indexerFetch(`/api/tally/delegates?${search}`, {
    timeoutMs: 15_000,
  });
  if (!upstream.ok) {
    throw new Error(`Indexer request failed: ${upstream.status}`);
  }

  const result = (await upstream.json()) as TallyDelegateListResult;
  const delegates: DelegateInfo[] = result.delegates.map((row) => ({
    address: row.address,
    votingPower: row.votingPower,
    lastChangeBlock: row.lastChangeBlock,
  }));

  return { delegates, fetchedAt: new Date().toISOString() };
}

const getCachedTopDelegatesOrThrow = unstable_cache(
  fetchTopDelegatesFromIndexer,
  ["tally-zero-top-delegates-v1"],
  { revalidate: TOP_DELEGATES_REVALIDATE_SECONDS }
);

/**
 * The most recent list this process managed to read. The data cache keeps
 * serving a stale entry while a background revalidation fails, but it starts
 * empty after a deploy and can be evicted. Holding the last good value here as
 * well makes "serve the last list we had" explicit rather than a property of
 * the cache layer, at the cost of being per instance.
 */
let lastKnownGood: TopDelegatesSnapshot | null = null;

/**
 * The candidate list for the didn't-vote fallback, refreshed hourly.
 *
 * Exists so that an indexer outage degrades to "the top 300 as of the last
 * successful read" rather than to the months-old snapshot bundled with the
 * SDK. Throws only when there has never been a successful read.
 */
export async function getCachedTopDelegates(): Promise<TopDelegatesSnapshot> {
  try {
    const snapshot = await getCachedTopDelegatesOrThrow();
    lastKnownGood = snapshot;
    return snapshot;
  } catch (error) {
    if (lastKnownGood) {
      debug.app(
        "top delegates refresh failed, serving list from %s: %O",
        lastKnownGood.fetchedAt,
        error
      );
      return lastKnownGood;
    }
    throw error;
  }
}

/** Test seam: forget the in-process last-known-good list. */
export function resetTopDelegatesMemory(): void {
  lastKnownGood = null;
}
