"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  queryDelegatesNotVoted,
  type DelegateCache,
} from "@gzeoneth/gov-tracker";

import { useRpcSettings } from "@/hooks/use-rpc-settings";
import { debug } from "@/lib/debug";
import { loadDelegateCache } from "@/lib/delegate-cache";
import { toError } from "@/lib/error-utils";
import { createRpcProvider } from "@/lib/rpc-utils";
import { getTallyDataClient } from "@/lib/tally-data/client";

export interface DelegateNotVoted {
  address: string;
  label: string | undefined;
  votingPower: string;
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

      const displayRecords =
        await getTallyDataClient().getAddressDisplayRecords(
          sdkResults.map((d) => d.address)
        );
      const notVoted: DelegateNotVoted[] = sdkResults.map((d) => {
        const display = displayRecords.get(d.address.toLowerCase());
        return {
          address: d.address,
          label: display?.label ?? undefined,
          votingPower: d.votingPower,
        };
      });

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
