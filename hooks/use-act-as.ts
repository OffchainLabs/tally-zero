"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { siweApi } from "@/lib/siwe/client";
import { SAFES_SCOPE, SUBJECT_SCOPE, siweKeys } from "@/lib/siwe/keys";
import type { KnownSafe } from "@/lib/siwe/types";

import { useSiwe } from "./use-siwe";

/**
 * The Safes this signer has previously proven ownership of.
 *
 * This is a *recall* list, not a discovery one: the indexer only remembers a
 * Safe after a successful act-as, so it is empty for every new user. Any UI
 * built on it therefore needs an address-entry path too, or there is no way in.
 *
 * Keyed on the session address rather than the connected wallet. Those diverge
 * — sign in as A, then switch wallet to B without signing out — and the
 * response belongs to whoever the *session* says you are. Keying on the
 * connected address would file A's Safes under B.
 */
export function useSafes() {
  const { session } = useSiwe();
  const signer = session?.address;

  return useQuery<KnownSafe[]>({
    queryKey: siweKeys.safes(signer),
    queryFn: () => siweApi.safes(),
    enabled: Boolean(signer),
    staleTime: 30_000,
  });
}

/**
 * Enter and leave act-as mode.
 *
 * Switching subject drops everything subject-bound in one call: subject-scoped
 * keys all nest under SUBJECT_SCOPE, so this covers queries added later without
 * anyone remembering to update a list here.
 */
export function useActAs() {
  const queryClient = useQueryClient();

  async function resubject() {
    // Learn the new subject first — everything else keys off it.
    await queryClient.invalidateQueries({ queryKey: siweKeys.me });
    queryClient.removeQueries({ queryKey: SUBJECT_SCOPE });
  }

  const start = useMutation({
    mutationFn: (safeAddress: string) => siweApi.actAs(safeAddress),
    onSuccess: async () => {
      await resubject();
      // A first successful act-as is also what adds the Safe to the recall
      // list, so the switcher's own list is now stale. Invalidating the scope
      // root covers whichever signer it is keyed under, so this hook does not
      // need to know the session at all.
      queryClient.invalidateQueries({ queryKey: SAFES_SCOPE });
    },
  });

  const stop = useMutation({
    mutationFn: () => siweApi.stopActingAs(),
    onSuccess: resubject,
  });

  return {
    actAs: start.mutateAsync,
    isStarting: start.isPending,
    startError: start.error as Error | null,
    resetStartError: start.reset,
    stopActingAs: stop.mutateAsync,
    isStopping: stop.isPending,
  };
}
