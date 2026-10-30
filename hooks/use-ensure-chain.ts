"use client";

import { useCallback } from "react";
import { toast } from "sonner";
import { useAccount, useChainId, useSwitchChain } from "wagmi";

import { getErrorMessage, isUserRejectedError } from "@/lib/error-utils";

export interface EnsureChainResult {
  /** A wallet is connected, and on some other chain */
  isWrongNetwork: boolean;
  /** A switch requested by `ensure` is waiting on the wallet */
  isSwitching: boolean;
  /**
   * Resolves once the wallet is on `chainId`, asking it to switch first if it
   * is not. Rejects when the switch fails or is refused; a refusal is not
   * toasted, since the user already knows they declined.
   */
  ensure: () => Promise<void>;
}

/**
 * Wrong-network handling for a flow that must run on one chain, as
 * `useArbDelegation` does for Arbitrum One. With no wallet connected there is
 * nothing to switch, so `isWrongNetwork` is false and `ensure` is a no-op.
 */
export function useEnsureChain(chainId: number): EnsureChainResult {
  const { isConnected } = useAccount();
  const currentChainId = useChainId();
  const { switchChainAsync, isPending } = useSwitchChain();

  const isWrongNetwork = isConnected && currentChainId !== chainId;

  const ensure = useCallback(async () => {
    if (!isWrongNetwork) return;
    try {
      await switchChainAsync({ chainId });
    } catch (error) {
      if (!isUserRejectedError(error)) {
        toast.error(getErrorMessage(error, "switch network"), {
          id: `ensure-chain-${chainId}`,
        });
      }
      throw error;
    }
  }, [chainId, isWrongNetwork, switchChainAsync]);

  return { isWrongNetwork, isSwitching: isPending, ensure };
}
