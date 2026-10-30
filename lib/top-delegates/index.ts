/**
 * Candidate list for the "didn't vote" badges when the governance indexer is
 * unreachable.
 *
 * RPC can answer `getVotes(address)` but cannot list delegates, so an offline
 * fallback needs a candidate address list from somewhere. This module holds the
 * pure parts shared by the server-side read (`./server`), the API route, the
 * hook, and their tests: the response shape, the limits, and the re-ranking
 * that turns candidates plus live on-chain powers into a top list.
 */

import type { DelegateInfo } from "@gzeoneth/gov-tracker";

import {
  DELEGATE_MIN_VOTING_POWER_WEI,
  isExcludedDelegateAddress,
} from "@/config/delegates";

/**
 * How many top delegates the badges check `hasVoted` against. Also the SDK's
 * own default for `maxDelegatesToCheck`, which is what the badges were tuned
 * for.
 */
export const TOP_DELEGATES_TO_CHECK = 100;

/**
 * How many candidates the server keeps. Three times the badge cap, so a
 * delegate who climbed from rank 150 since the list was fetched still makes
 * the cut once powers are refreshed on-chain.
 */
export const TOP_DELEGATES_CANDIDATE_LIMIT = 3 * TOP_DELEGATES_TO_CHECK;

/**
 * How long the server-side candidate list stays fresh, in seconds.
 *
 * Membership of the top 300 moves on the scale of delegations, not votes, and
 * every visitor gets the same list, so one indexer read an hour is plenty. The
 * powers themselves are refreshed live over RPC at use time, so only the list
 * membership ages.
 */
export const TOP_DELEGATES_REVALIDATE_SECONDS = 3600;

/**
 * How long the CDN may keep serving a stale copy while it revalidates. Longer
 * than the revalidate window on purpose: this route exists for indexer
 * outages, and a day-old membership list beats none.
 */
export const TOP_DELEGATES_STALE_SECONDS = 86_400;

/** `getVotes` reads per multicall when refreshing candidate powers. */
export const VOTING_POWER_REFRESH_CHUNK = 100;

/** Response shape of `GET /api/top-delegates`. */
export interface TopDelegatesSnapshot {
  /** Indexer rows above the app threshold, sorted by voting power desc. */
  delegates: DelegateInfo[];
  /** ISO timestamp of the indexer read, so a stale list is recognisable. */
  fetchedAt: string;
}

export function chunkAddresses<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

/**
 * Re-rank candidates on live voting power.
 *
 * `livePowers` is keyed by lowercase address (the shape
 * `queryDelegateVotingPowers` returns). A candidate without a live reading is
 * dropped rather than kept at its listed power: `getVotes` on the ARB token
 * does not revert for any address, so a gap means that read failed, and the
 * listed value may be months old on the bundled-snapshot path. Dropping it
 * keeps the rule that a power on a badge is never older than the page load.
 * The app threshold and the governance exclude address are applied after the
 * overlay because a delegate can cross either since the list was fetched.
 */
export function rankDelegateCandidates(
  candidates: readonly DelegateInfo[],
  livePowers: ReadonlyMap<string, string>,
  limit: number
): DelegateInfo[] {
  const threshold = BigInt(DELEGATE_MIN_VOTING_POWER_WEI);

  return candidates
    .flatMap((candidate) => {
      const live = livePowers.get(candidate.address.toLowerCase());
      return live === undefined ? [] : [{ ...candidate, votingPower: live }];
    })
    .filter(
      (candidate) =>
        !isExcludedDelegateAddress(candidate.address) &&
        BigInt(candidate.votingPower) >= threshold
    )
    .sort((a, b) => {
      const aPower = BigInt(a.votingPower);
      const bPower = BigInt(b.votingPower);
      if (aPower > bPower) return -1;
      if (aPower < bPower) return 1;
      return 0;
    })
    .slice(0, limit);
}

/** Same-origin read of the server-cached candidate list. */
export async function fetchTopDelegatesSnapshot(): Promise<TopDelegatesSnapshot> {
  const response = await fetch("/api/top-delegates", {
    headers: { accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Top delegates request failed: ${response.status}`);
  }
  return (await response.json()) as TopDelegatesSnapshot;
}
