"use client";

/**
 * Hook for looking up delegate information by address
 * Fetches voting power, delegation status, and cache rank from ARB token
 */

import { ethers } from "ethers";
import { useCallback, useEffect, useState } from "react";

import { ADDRESSES, ERC20_VOTES_ABI } from "@gzeoneth/gov-tracker";

import { useRpcSettings } from "@/hooks/use-rpc-settings";
import { addressesEqual, isValidAddress } from "@/lib/address-utils";
import { debug } from "@/lib/debug";
import { getDelegateRankInfo } from "@/lib/delegate-cache";
import { getErrorMessage } from "@/lib/error-utils";
import { createRpcProvider } from "@/lib/rpc-utils";
import { getTallyDataClient } from "@/lib/tally-data/client";

/** Result from delegate lookup containing voting and delegation info */
export interface DelegateLookupResult {
  /** Checksummed delegate address */
  address: string;
  /** Current voting power in wei */
  votingPower: string;
  /** Address this delegate has delegated to */
  delegatedTo: string;
  /** Whether the delegate votes for themselves */
  isSelfDelegated: boolean;
  /** Optional label from known delegates list */
  label?: string;
  /** Rank in the delegate cache if present */
  cacheRank?: number;
  /** Cached voting power for comparison */
  cacheVotingPower?: string;
}

/** Options for configuring delegate lookup */
export interface UseDelegateLookupOptions {
  /** Address to look up */
  address: string;
  /** Whether lookup is enabled */
  enabled?: boolean;
  /** Custom RPC URL to use */
  customRpcUrl?: string;
}

/** Return type for useDelegateLookup hook */
export interface UseDelegateLookupReturn {
  /** Lookup result or null */
  result: DelegateLookupResult | null;
  /** Whether lookup is in progress */
  isLoading: boolean;
  /** Error message if lookup failed */
  error: string | null;
  /** Function to manually refetch */
  refetch: () => void;
}

/**
 * Hook for looking up delegate voting power and delegation status
 * @param options - Lookup options including address and RPC URL
 * @returns Delegate info, loading state, error, and refetch function
 */
export function useDelegateLookup({
  address,
  enabled = true,
  customRpcUrl,
}: UseDelegateLookupOptions): UseDelegateLookupReturn {
  const { l2Rpc, isHydrated } = useRpcSettings({ customL2Rpc: customRpcUrl });

  const [result, setResult] = useState<DelegateLookupResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDelegateInfo = useCallback(async () => {
    if (!address || !enabled) return;

    if (!isValidAddress(address)) {
      setError("Invalid Ethereum address");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const provider = await createRpcProvider(l2Rpc);

      const contract = new ethers.Contract(
        ADDRESSES.ARB_TOKEN,
        ERC20_VOTES_ABI,
        provider
      );

      // Fetch voting power and delegate in parallel
      const [votingPower, delegatedTo] = await Promise.all([
        contract.getVotes(address),
        contract.delegates(address),
      ]);

      // Get delegate label and rank from cache/data source.
      const displayRecord = (
        await getTallyDataClient().getAddressDisplayRecords([address])
      ).get(address.toLowerCase());
      const label = displayRecord?.label ?? undefined;
      let cacheRank: number | undefined;
      let cacheVotingPower: string | undefined;

      try {
        const rankInfo = await getDelegateRankInfo(address);
        if (rankInfo) {
          cacheRank = rankInfo.rank;
          cacheVotingPower = rankInfo.votingPower;
        }
      } catch (cacheErr) {
        debug.delegates("failed to check delegate cache: %O", cacheErr);
      }

      setResult({
        address: ethers.utils.getAddress(address),
        votingPower: votingPower.toString(),
        delegatedTo: ethers.utils.getAddress(delegatedTo),
        isSelfDelegated: addressesEqual(address, delegatedTo),
        label,
        cacheRank,
        cacheVotingPower,
      });
    } catch (err) {
      debug.delegates("lookup error: %O", err);
      setError(getErrorMessage(err, "fetch delegate info"));
      setResult(null);
    } finally {
      setIsLoading(false);
    }
  }, [address, enabled, l2Rpc]);

  useEffect(() => {
    if (!isHydrated) return;
    if (address && enabled) {
      fetchDelegateInfo();
    } else {
      setResult(null);
      setError(null);
    }
  }, [isHydrated, address, enabled, fetchDelegateInfo]);

  return {
    result,
    isLoading,
    error,
    refetch: fetchDelegateInfo,
  };
}
