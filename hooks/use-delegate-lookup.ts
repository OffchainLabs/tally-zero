"use client";

/**
 * Hook for looking up delegate information by address
 * Fetches voting power, delegation status, and cache rank from ARB token
 */

import { ethers } from "ethers";
import { useCallback, useEffect, useState } from "react";

import { ARBITRUM_RPC_URL, ARB_TOKEN } from "@/config/arbitrum-governance";
import { STORAGE_KEYS } from "@/config/storage-keys";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { addressesEqual, isValidAddress } from "@/lib/address-utils";
import { debug } from "@/lib/debug";
import { getDelegateLabel, loadDelegateCache } from "@/lib/delegate-cache";
import { getErrorMessage } from "@/lib/error-utils";
import { createRpcProvider } from "@/lib/rpc-utils";

/** Minimal ABI for ERC20Votes with OpenZeppelin standard methods */
const ERC20_VOTES_ABI = [
  "function getVotes(address account) view returns (uint256)",
  "function delegates(address account) view returns (address)",
];

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
  const [storedL2Rpc, , l2RpcHydrated] = useLocalStorage(
    STORAGE_KEYS.L2_RPC,
    ""
  );

  const [result, setResult] = useState<DelegateLookupResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rpcUrl = customRpcUrl || storedL2Rpc || ARBITRUM_RPC_URL;

  const fetchDelegateInfo = useCallback(async () => {
    if (!address || !enabled) return;

    if (!isValidAddress(address)) {
      setError("Invalid Ethereum address");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const provider = await createRpcProvider(rpcUrl);

      const contract = new ethers.Contract(
        ARB_TOKEN.address,
        ERC20_VOTES_ABI,
        provider
      );

      // Fetch voting power and delegate in parallel
      const [votingPower, delegatedTo] = await Promise.all([
        contract.getVotes(address),
        contract.delegates(address),
      ]);

      // Check if address is in the delegate cache
      let cacheRank: number | undefined;
      let cacheVotingPower: string | undefined;
      const label = getDelegateLabel(address);

      try {
        const cache = await loadDelegateCache();
        if (cache) {
          const index = cache.delegates.findIndex((d) =>
            addressesEqual(d.address, address)
          );
          if (index !== -1) {
            cacheRank = index + 1;
            cacheVotingPower = cache.delegates[index].votingPower;
          }
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
  }, [address, enabled, rpcUrl]);

  useEffect(() => {
    if (!l2RpcHydrated) return;
    if (address && enabled) {
      fetchDelegateInfo();
    } else {
      setResult(null);
      setError(null);
    }
  }, [l2RpcHydrated, address, enabled, fetchDelegateInfo]);

  return {
    result,
    isLoading,
    error,
    refetch: fetchDelegateInfo,
  };
}
