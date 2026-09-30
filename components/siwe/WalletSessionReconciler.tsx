"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useAccount } from "wagmi";

import { siweApi } from "@/lib/siwe/client";
import { siweKeys } from "@/lib/siwe/keys";
import { logoutPreviousWalletSession } from "@/lib/siwe/session-cache";
import type { MeResponse } from "@/lib/siwe/types";

/** Revoke the old SIWE cookie after a different wallet connects. */
export function WalletSessionReconciler() {
  const { address, isConnected } = useAccount();
  const queryClient = useQueryClient();
  const { data: session } = useQuery<MeResponse | null>({
    queryKey: siweKeys.me,
    queryFn: () => siweApi.me(),
    staleTime: 30_000,
  });

  useEffect(() => {
    if (
      !isConnected ||
      !address ||
      !session ||
      session.address.toLowerCase() === address.toLowerCase()
    ) {
      return;
    }
    void logoutPreviousWalletSession(queryClient, address).catch(() => {
      // Keep the old session gated in useSiwe. Signing in retries the logout
      // and surfaces an error if the server remains unavailable.
    });
  }, [address, isConnected, queryClient, session]);

  return null;
}
