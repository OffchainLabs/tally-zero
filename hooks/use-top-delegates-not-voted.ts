"use client";

/**
 * Hook for finding top delegates who haven't voted on a proposal
 * Useful for highlighting key stakeholders who could still influence the vote
 */

import { ethers } from "ethers";
import { useCallback, useEffect, useRef, useState } from "react";

import { ARBITRUM_RPC_URL } from "@/config/arbitrum-governance";
import { STORAGE_KEYS } from "@/config/storage-keys";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { debug } from "@/lib/debug";
import {
  getDelegateLabel,
  getTopDelegates,
  loadDelegateCache,
} from "@/lib/delegate-cache";
import { toError } from "@/lib/error-utils";
import { decodeResult, encodeCall, multicall } from "@/lib/multicall";
import { createRpcProvider } from "@/lib/rpc-utils";
import type { DelegateInfo } from "@/types/delegate";
import OzGovernor_ABI from "@data/OzGovernor_ABI.json";

/** Delegate who hasn't voted on a proposal */
export interface DelegateNotVoted {
  /** Delegate's address */
  address: string;
  /** Optional label from known delegates list */
  label: string | undefined;
  /** Delegate's voting power in wei */
  votingPower: string;
}

/** Number of delegates to check per RPC batch */
const BATCH_SIZE = 20;

/** Maximum number of top delegates to scan */
const MAX_DELEGATES_TO_CHECK = 100;

/** Default number of non-voting delegates to return */
const DEFAULT_LIMIT = 5;

/**
 * Hook for finding top delegates who haven't voted on a specific proposal
 * @param options - Proposal ID, governor address, limit, and optional RPC URL
 * @returns List of non-voting delegates, loading state, and error
 */
export function useTopDelegatesNotVoted({
  proposalId,
  governorAddress,
  limit = DEFAULT_LIMIT,
  customRpcUrl,
}: {
  proposalId: string;
  governorAddress: string;
  limit?: number;
  customRpcUrl?: string;
}) {
  const [storedL2Rpc, , l2RpcHydrated] = useLocalStorage(
    STORAGE_KEYS.L2_RPC,
    ""
  );

  const [delegatesNotVoted, setDelegatesNotVoted] = useState<
    DelegateNotVoted[]
  >([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [allTopDelegatesVoted, setAllTopDelegatesVoted] = useState(false);

  // Track the last fetched proposal to detect when we need to refetch
  const lastFetchedProposalRef = useRef<string | null>(null);
  const effectiveRpcUrl = customRpcUrl || storedL2Rpc || ARBITRUM_RPC_URL;

  const fetchDelegatesNotVoted = useCallback(async () => {
    if (!proposalId || !governorAddress) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const cache = await loadDelegateCache();
      if (!cache) {
        setIsLoading(false);
        return;
      }

      const allDelegates: DelegateInfo[] = getTopDelegates(
        cache,
        MAX_DELEGATES_TO_CHECK
      );
      if (allDelegates.length === 0) {
        setIsLoading(false);
        return;
      }

      const provider = await createRpcProvider(effectiveRpcUrl);
      const governorInterface = new ethers.utils.Interface(OzGovernor_ABI);

      const notVoted: DelegateNotVoted[] = [];
      let offset = 0;

      while (notVoted.length < limit && offset < allDelegates.length) {
        const batch = allDelegates.slice(offset, offset + BATCH_SIZE);

        const calls = batch.map((delegate) => ({
          target: governorAddress,
          allowFailure: true,
          callData: encodeCall(governorInterface, "hasVoted", [
            proposalId,
            delegate.address,
          ]),
        }));

        const results = await multicall(provider, calls);

        for (let i = 0; i < results.length; i++) {
          const result = results[i];
          const delegate = batch[i];

          if (result.success) {
            const voted = decodeResult<boolean>(
              governorInterface,
              "hasVoted",
              result.returnData
            );
            if (!voted && notVoted.length < limit) {
              notVoted.push({
                address: delegate.address,
                label: getDelegateLabel(delegate.address),
                votingPower: delegate.votingPower,
              });
            }
          }
        }

        offset += BATCH_SIZE;
      }

      setDelegatesNotVoted(notVoted);
      setAllTopDelegatesVoted(notVoted.length === 0 && offset >= BATCH_SIZE);
    } catch (err) {
      debug.delegates("top delegates not voted error: %O", err);
      setError(toError(err));
    } finally {
      setIsLoading(false);
    }
  }, [proposalId, governorAddress, limit, effectiveRpcUrl]);

  // Refetch when proposalId or governorAddress changes
  useEffect(() => {
    if (!l2RpcHydrated) return;

    // Create a unique key for this proposal
    const proposalKey = `${proposalId}:${governorAddress}`;

    // Only refetch if this is a new proposal
    if (lastFetchedProposalRef.current !== proposalKey) {
      lastFetchedProposalRef.current = proposalKey;
      fetchDelegatesNotVoted();
    }
  }, [l2RpcHydrated, proposalId, governorAddress, fetchDelegatesNotVoted]);

  return {
    delegatesNotVoted,
    isLoading,
    error,
    allTopDelegatesVoted,
  };
}
