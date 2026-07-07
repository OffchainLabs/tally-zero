"use client";

import { useQuery } from "@tanstack/react-query";

import { queryDelegateVotingPowers } from "@gzeoneth/gov-tracker";

import { useRpcSettings } from "@/hooks/use-rpc-settings";
import { toError } from "@/lib/error-utils";
import { createRpcProvider } from "@/lib/rpc-utils";

/**
 * How long a fetched voting power is treated as fresh. Voting power changes as
 * delegations move, so it must not be cached indefinitely. Within this window
 * the value is shared across pages without a refetch; after it, react-query
 * refreshes on the next mount/focus/reconnect, and `refetchInterval` covers a
 * long-open page that never remounts or refocuses.
 */
const VOTING_POWER_FRESH_MS = 60 * 60 * 1000; // 1 hour

/**
 * Shared TanStack Query key for a delegate's live on-chain voting power.
 *
 * The delegate search table and the delegate profile both read on-chain
 * voting power (ARB token `getVotes`). Using the same key lets them share a
 * single cache entry, so a value fetched on one page is reused on the other
 * instead of being re-queried. The RPC URL is part of the key because the
 * result is RPC-specific (e.g. a custom RPC passed on the search page).
 */
export function delegateVotingPowerKey(
  address: string,
  l2Rpc: string
): [string, string, string] {
  return ["delegate-voting-power", address.toLowerCase(), l2Rpc];
}

/**
 * Fetches a single delegate's current on-chain voting power via the
 * gov-tracker `getVotes` multicall, mirroring what the search table does in
 * batch. Returns the power as a wei string, or `null` when unavailable.
 */
export function useDelegateVotingPower(
  address: string | undefined,
  options: { enabled?: boolean } = {}
) {
  const { enabled = true } = options;
  const { l2Rpc, isHydrated } = useRpcSettings();

  return useQuery<string | null, Error>({
    queryKey: address
      ? delegateVotingPowerKey(address, l2Rpc)
      : ["delegate-voting-power", null, l2Rpc],
    queryFn: async () => {
      if (!address) return null;
      try {
        const provider = await createRpcProvider(l2Rpc);
        const powerMap = await queryDelegateVotingPowers(provider, [address]);
        return powerMap.get(address.toLowerCase()) ?? null;
      } catch (err) {
        throw toError(err);
      }
    },
    enabled: enabled && isHydrated && !!address,
    staleTime: VOTING_POWER_FRESH_MS,
    gcTime: VOTING_POWER_FRESH_MS,
    refetchInterval: VOTING_POWER_FRESH_MS,
    refetchIntervalInBackground: false,
  });
}
