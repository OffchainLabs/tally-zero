"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useAccount } from "wagmi";

import { meQueryOptions } from "@/lib/siwe/queries";
import { logoutPreviousWalletSession } from "@/lib/siwe/session-cache";

/** Revoke the old SIWE cookie after a different wallet connects. */
export function WalletSessionReconciler() {
  const { address, isConnected } = useAccount();
  const queryClient = useQueryClient();
  const { data: session } = useQuery(meQueryOptions);

  useEffect(() => {
    if (
      !isConnected ||
      !address ||
      !session ||
      session.address.toLowerCase() === address.toLowerCase()
    ) {
      return;
    }
    const controller = new AbortController();
    void logoutPreviousWalletSession(
      queryClient,
      address,
      controller.signal
    ).catch(() => {
      // Keep the old session gated in useSiwe. Signing in retries the logout
      // and surfaces an error if the server remains unavailable.
    });
    // A delayed /api/me response must not revoke a session for a wallet the
    // user has already switched back to. Leave the shared query running.
    return () => controller.abort();
  }, [address, isConnected, queryClient, session]);

  return null;
}
