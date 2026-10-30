"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { ethers } from "ethers";

import {
  DELEGATE_CACHE_VERSION,
  queryDelegatesNotVoted,
  queryDelegateVotingPowers,
  type DelegateCache,
  type DelegateInfo,
} from "@gzeoneth/gov-tracker";

import { ARBITRUM_CHAIN_ID } from "@/config/arbitrum-governance";
import {
  DELEGATE_MIN_VOTING_POWER_WEI,
  EXCLUDED_DELEGATE_ADDRESSES,
} from "@/config/delegates";
import { sortDelegatesByVotingPower } from "@/hooks/use-delegate-search";
import { useRpcSettings } from "@/hooks/use-rpc-settings";
import { debug } from "@/lib/debug";
import {
  getDelegateDisplayRecords,
  loadDelegateCache,
} from "@/lib/delegate-cache";
import { toError } from "@/lib/error-utils";
import { createRpcProvider } from "@/lib/rpc-utils";
import { getTallyDataClient } from "@/lib/tally-data/client";
import type { TallyDelegateListResult } from "@/lib/tally-data/types";
import {
  chunkAddresses,
  fetchTopDelegatesSnapshot,
  rankDelegateCandidates,
  TOP_DELEGATES_CANDIDATE_LIMIT,
  VOTING_POWER_REFRESH_CHUNK,
} from "@/lib/top-delegates";

const TOP_DELEGATES_TO_CHECK = 100;

export interface DelegateNotVoted {
  address: string;
  label: string | undefined;
  votingPower: string;
}

/**
 * Wraps delegate rows in the SDK's DelegateCache shape so they can be fed to
 * queryDelegatesNotVoted, which consumes only the `delegates` array and
 * silently requires it sorted by voting power descending. Everything else in
 * the shape is filler the SDK never reads.
 */
function wrapDelegateCache(
  delegates: DelegateInfo[],
  totals: { totalVotingPower?: string | null; totalSupply?: string | null } = {}
): DelegateCache {
  return {
    version: DELEGATE_CACHE_VERSION,
    generatedAt: new Date().toISOString(),
    snapshotBlock: 0,
    startBlock: 0,
    chainId: ARBITRUM_CHAIN_ID,
    totalVotingPower: totals.totalVotingPower ?? "0",
    totalSupply: totals.totalSupply ?? "0",
    delegates,
    stats: { totalDelegates: delegates.length },
  };
}

/** Indexer page to cache shape. Re-sorts defensively; the indexer already does. */
export function toDelegateCache(
  result: TallyDelegateListResult
): DelegateCache {
  return wrapDelegateCache(
    sortDelegatesByVotingPower(result.delegates),
    result
  );
}

/**
 * Merges the SDK's non-voter list with display labels. The display-records map
 * is keyed by lowercase address.
 */
export function buildNotVotedList(
  sdkResults: Array<{ address: string; votingPower: string }>,
  displayRecords: Map<string, { label: string | null }>
): DelegateNotVoted[] {
  return sdkResults.map((d) => ({
    address: d.address,
    label: displayRecords.get(d.address.toLowerCase())?.label ?? undefined,
    votingPower: d.votingPower,
  }));
}

/**
 * Candidate addresses for the outage path, best source first: the server's
 * last successful indexer read (hourly, survives the indexer being down), then
 * the snapshot bundled with the SDK. Null when neither is available.
 */
async function loadFallbackCandidates(): Promise<DelegateInfo[] | null> {
  try {
    const snapshot = await fetchTopDelegatesSnapshot();
    debug.delegates(
      "using server top-delegates list from %s",
      snapshot.fetchedAt
    );
    return snapshot.delegates;
  } catch (err) {
    debug.delegates("server top delegates fetch failed: %O", err);
  }

  const bundled = await loadDelegateCache();
  if (!bundled) return null;
  debug.delegates("using bundled delegate snapshot as candidate list");
  return bundled.delegates.slice(0, TOP_DELEGATES_CANDIDATE_LIMIT);
}

/**
 * Refresh candidate powers on-chain and re-rank. Powers shown on the badges
 * are never older than this read; only list membership can be stale.
 */
async function refreshCandidatesOnChain(
  provider: ethers.providers.Provider,
  candidates: DelegateInfo[]
): Promise<DelegateCache> {
  const livePowers = new Map<string, string>();
  for (const chunk of chunkAddresses(
    candidates.map((c) => c.address),
    VOTING_POWER_REFRESH_CHUNK
  )) {
    const powers = await queryDelegateVotingPowers(provider, chunk);
    for (const [address, power] of powers) livePowers.set(address, power);
  }

  return wrapDelegateCache(
    rankDelegateCandidates(candidates, livePowers, TOP_DELEGATES_TO_CHECK)
  );
}

/**
 * The delegate set to check hasVoted against. Live indexer first; a healthy
 * answer is authoritative even when empty. On a failed fetch, fall back to a
 * candidate list refreshed on-chain rather than to stale numbers. An RPC
 * failure during that refresh propagates: no fallback shows old powers.
 */
async function resolveTopDelegateCache(
  provider: ethers.providers.Provider
): Promise<DelegateCache | null> {
  try {
    const page = await getTallyDataClient().getDelegatesPage({
      minVotingPower: DELEGATE_MIN_VOTING_POWER_WEI,
      exclude: [...EXCLUDED_DELEGATE_ADDRESSES],
      limit: TOP_DELEGATES_TO_CHECK,
      offset: 0,
      sort: "votingPower",
      dir: "desc",
    });
    return toDelegateCache(page);
  } catch (err) {
    debug.delegates("indexer top delegates fetch failed: %O", err);
  }

  const candidates = await loadFallbackCandidates();
  if (!candidates) return null;
  return refreshCandidatesOnChain(provider, candidates);
}

export function useTopDelegatesNotVoted({
  proposalId,
  governorAddress,
  limit = 5,
  customRpcUrl,
}: {
  proposalId: string;
  governorAddress: string;
  limit?: number;
  customRpcUrl?: string;
}) {
  const { l2Rpc, isHydrated } = useRpcSettings({ customL2Rpc: customRpcUrl });

  const [delegatesNotVoted, setDelegatesNotVoted] = useState<
    DelegateNotVoted[]
  >([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [allTopDelegatesVoted, setAllTopDelegatesVoted] = useState(false);

  const lastFetchedProposalRef = useRef<string | null>(null);

  const fetchDelegatesNotVoted = useCallback(async () => {
    if (!proposalId || !governorAddress) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const provider = await createRpcProvider(l2Rpc);

      const cache = await resolveTopDelegateCache(provider);
      if (!cache) {
        setIsLoading(false);
        return;
      }

      const sdkResults = await queryDelegatesNotVoted(
        provider,
        proposalId,
        governorAddress,
        // Cap explicitly: every source above is already at most this long, but
        // the SDK default is what the badges were tuned for.
        { cache, limit, maxDelegatesToCheck: TOP_DELEGATES_TO_CHECK }
      );

      const displayRecords = await getDelegateDisplayRecords(
        sdkResults.map((d) => d.address)
      );
      const notVoted = buildNotVotedList(sdkResults, displayRecords);

      setDelegatesNotVoted(notVoted);
      setAllTopDelegatesVoted(notVoted.length === 0);
    } catch (err) {
      debug.delegates("top delegates not voted error: %O", err);
      setError(toError(err));
    } finally {
      setIsLoading(false);
    }
  }, [proposalId, governorAddress, limit, l2Rpc]);

  useEffect(() => {
    if (!isHydrated) return;

    const proposalKey = `${proposalId}:${governorAddress}`;

    if (lastFetchedProposalRef.current !== proposalKey) {
      lastFetchedProposalRef.current = proposalKey;
      fetchDelegatesNotVoted();
    }
  }, [isHydrated, proposalId, governorAddress, fetchDelegatesNotVoted]);

  return {
    delegatesNotVoted,
    isLoading,
    error,
    allTopDelegatesVoted,
  };
}
