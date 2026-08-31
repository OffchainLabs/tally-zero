"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useQueryClient } from "@tanstack/react-query";

import {
  queryDelegatesNotVoted,
  queryDelegateVotingPowers,
  type DelegateCache,
} from "@gzeoneth/gov-tracker";

import { delegateVotingPowerKey } from "@/hooks/use-delegate-voting-power";
import { useRpcSettings } from "@/hooks/use-rpc-settings";
import { debug } from "@/lib/debug";
import {
  getDelegateDisplayRecords,
  loadDelegateCache,
} from "@/lib/delegate-cache";
import { toError } from "@/lib/error-utils";
import { createRpcProvider } from "@/lib/rpc-utils";

export interface DelegateNotVoted {
  address: string;
  label: string | undefined;
  votingPower: string;
}

/**
 * Merges the SDK's non-voter list with live on-chain voting powers and display
 * labels. The SDK's votingPower comes from the bundled delegate cache, which
 * can be months stale; the live value wins whenever the refresh returned one,
 * so the badges match the delegates tab. Both maps are keyed by lowercase
 * address.
 */
export function buildNotVotedList(
  sdkResults: Array<{ address: string; votingPower: string }>,
  livePowers: Map<string, string>,
  displayRecords: Map<string, { label: string | null }>
): DelegateNotVoted[] {
  return sdkResults.map((d) => {
    const lower = d.address.toLowerCase();
    return {
      address: d.address,
      label: displayRecords.get(lower)?.label ?? undefined,
      votingPower: livePowers.get(lower) ?? d.votingPower,
    };
  });
}

async function fetchLivePowersOrEmpty(
  provider: Parameters<typeof queryDelegateVotingPowers>[0],
  addresses: string[]
): Promise<Map<string, string>> {
  try {
    return await queryDelegateVotingPowers(provider, addresses);
  } catch (err) {
    debug.delegates("live voting power refresh failed: %O", err);
    return new Map();
  }
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
  const queryClient = useQueryClient();

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
      const cache: DelegateCache | null = await loadDelegateCache();
      if (!cache) {
        setIsLoading(false);
        return;
      }

      const provider = await createRpcProvider(l2Rpc);

      const sdkResults = await queryDelegatesNotVoted(
        provider,
        proposalId,
        governorAddress,
        { cache, limit }
      );

      const livePowers = await fetchLivePowersOrEmpty(
        provider,
        sdkResults.map((d) => d.address)
      );
      for (const [addr, power] of livePowers) {
        queryClient.setQueryData(delegateVotingPowerKey(addr, l2Rpc), power);
      }

      const displayRecords = await getDelegateDisplayRecords(
        sdkResults.map((d) => d.address)
      );
      const notVoted = buildNotVotedList(sdkResults, livePowers, displayRecords);

      setDelegatesNotVoted(notVoted);
      setAllTopDelegatesVoted(notVoted.length === 0);
    } catch (err) {
      debug.delegates("top delegates not voted error: %O", err);
      setError(toError(err));
    } finally {
      setIsLoading(false);
    }
  }, [proposalId, governorAddress, limit, l2Rpc, queryClient]);

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
