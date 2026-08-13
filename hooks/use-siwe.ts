"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { createSiweMessage } from "viem/siwe";
import { useAccount, useSignMessage } from "wagmi";

import { SIWE_CHAIN_ID } from "@/config/siwe";
import { siweApi } from "@/lib/siwe/client";
import { siweKeys } from "@/lib/siwe/keys";
import type { MeResponse } from "@/lib/siwe/types";

const ME_KEY = siweKeys.me;

/**
 * SIWE session state + sign-in/out. Sign-in does the standard dance: fetch a
 * nonce, build an EIP-4361 message (domain = current host, so it matches the
 * indexer's SIWE_DOMAINS), sign it with the connected wallet (personal_sign,
 * chain-agnostic), and POST it to /api/auth/verify — which sets the session
 * cookie relayed through the same-origin proxy.
 */
export function useSiwe() {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const queryClient = useQueryClient();

  const sessionQuery = useQuery<MeResponse | null>({
    queryKey: ME_KEY,
    queryFn: () => siweApi.me(),
    staleTime: 30_000,
  });

  const signIn = useMutation({
    mutationFn: async () => {
      if (!address) throw new Error("connect a wallet first");
      const nonce = await siweApi.nonce();
      const message = createSiweMessage({
        address,
        chainId: SIWE_CHAIN_ID,
        domain: window.location.host,
        nonce,
        uri: window.location.origin,
        version: "1",
        statement: "Sign in to manage your Arbitrum governance profile.",
      });
      const signature = await signMessageAsync({ message });
      await siweApi.verify(message, signature);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ME_KEY }),
  });

  const signOut = useMutation({
    mutationFn: () => siweApi.logout(),
    onSuccess: () => queryClient.setQueryData(ME_KEY, null),
  });

  const refreshSession = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ME_KEY }),
    [queryClient]
  );

  const session = sessionQuery.data ?? null;
  return {
    address,
    isConnected,
    session,
    /** The Safe being acted as, or null when acting as the signer itself. */
    actingAs: session?.actingAs ?? null,
    /**
     * Subject of every owned read/write — `actingAs ?? address`. Use this, not
     * `address`, to scope any query about "my" data.
     */
    effectiveAddress: session?.effectiveAddress ?? null,
    isSignedIn: Boolean(session),
    isLoadingSession: sessionQuery.isLoading,
    signIn: signIn.mutateAsync,
    isSigningIn: signIn.isPending,
    signInError: signIn.error as Error | null,
    signOut: signOut.mutateAsync,
    refreshSession,
  };
}
