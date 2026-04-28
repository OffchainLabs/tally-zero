"use client";

import { ethers } from "ethers";
import { useEffect, useState } from "react";

import { ARB_TOKEN } from "@/config/arbitrum-governance";
import { useRpcSettings } from "@/hooks/use-rpc-settings";
import { createRpcProvider } from "@/lib/rpc-utils";

const TOTAL_DELEGATION_ABI = [
  "function getTotalDelegationAt(uint256 blockNumber) view returns (uint256)",
] as const;

export function useTotalDelegationAt(
  blockNumber: string | undefined,
  enabled: boolean
): string | null {
  const { l2Rpc, isHydrated } = useRpcSettings();
  const delegationKey =
    enabled && isHydrated && blockNumber ? `${l2Rpc}:${blockNumber}` : null;
  const [totalDelegation, setTotalDelegation] = useState<{
    key: string;
    value: string | null;
  }>({ key: "", value: null });

  useEffect(() => {
    if (!delegationKey) return;

    const requestKey = delegationKey;
    const requestBlockNumber = blockNumber;
    if (!requestBlockNumber) return;

    let cancelled = false;

    async function fetchTotalDelegation() {
      try {
        const provider = await createRpcProvider(l2Rpc);
        const token = new ethers.Contract(
          ARB_TOKEN.address,
          TOTAL_DELEGATION_ABI,
          provider
        );
        const totalDelegationBN =
          await token.getTotalDelegationAt(requestBlockNumber);

        if (!cancelled) {
          setTotalDelegation({
            key: requestKey,
            value: totalDelegationBN.toString(),
          });
        }
      } catch {
        if (!cancelled) {
          setTotalDelegation({ key: requestKey, value: null });
        }
      }
    }

    fetchTotalDelegation();

    return () => {
      cancelled = true;
    };
  }, [blockNumber, delegationKey, l2Rpc]);

  return totalDelegation.key === delegationKey ? totalDelegation.value : null;
}
