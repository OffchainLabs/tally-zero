"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  DELEGATE_CACHE_VERSION,
  queryDelegatesNotVoted,
  type DelegateCache,
} from "@gzeoneth/gov-tracker";

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

const TOP_DELEGATES_TO_CHECK = 100;

export interface DelegateNotVoted {
  address: string;
  label: string | undefined;
  votingPower: string;
}

/**
 * Wraps indexer delegate rows in the SDK's DelegateCache shape so they can be
 * fed to queryDelegatesNotVoted, which consumes only the `delegates` array and
 * silently requires it sorted by voting power descending. The indexer's
 * votable-supply totals are null until it reaches chain head, despite the
 * declared string type.
 */
export function toDelegateCache(
  result: TallyDelegateListResult
): DelegateCache {
  const delegates = sortDelegatesByVotingPower(result.delegates);
  return {
    version: DELEGATE_CACHE_VERSION,
    generatedAt: new Date().toISOString(),
    snapshotBlock: 0,
    startBlock: 0,
    chainId: 42161,
    totalVotingPower: result.totalVotingPower ?? "0",
    totalSupply: result.totalSupply ?? "0",
    delegates,
    stats: { totalDelegates: delegates.length },
  };
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

async function fetchTopDelegateCacheOrBundled(): Promise<DelegateCache | null> {
  try {
    const page = await getTallyDataClient().getDelegatesPage({
      minVotingPower: DELEGATE_MIN_VOTING_POWER_WEI,
      exclude: [...EXCLUDED_DELEGATE_ADDRESSES],
      limit: TOP_DELEGATES_TO_CHECK,
      offset: 0,
      sort: "votingPower",
      dir: "desc",
    });
    if (page.delegates.length > 0) {
      return toDelegateCache(page);
    }
  } catch (err) {
    debug.delegates("indexer top delegates fetch failed: %O", err);
  }
  return loadDelegateCache();
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
      const cache = await fetchTopDelegateCacheOrBundled();
      if (!cache) {
        setIsLoading(false);
        return;
      }

      const provider = await createRpcProvider(l2Rpc);

      const sdkResults = await queryDelegatesNotVoted(
        provider,
        proposalId,
        governorAddress,
        { cache, limit, maxDelegatesToCheck: cache.delegates.length }
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
