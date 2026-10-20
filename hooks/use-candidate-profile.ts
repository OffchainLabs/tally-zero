"use client";

import {
  skipToken,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { siweApi } from "@/lib/siwe/client";
import { siweKeys } from "@/lib/siwe/keys";
import type {
  CandidateProfileFields,
  CandidateProfileVersion,
  ElectionSummary,
  MyCandidateProfile,
} from "@/lib/siwe/types";

import { useSiwe } from "./use-siwe";

/** Public election list. Not subject-scoped — no session is involved. */
export function useElections() {
  return useQuery<ElectionSummary[]>({
    queryKey: siweKeys.elections,
    queryFn: () => siweApi.listElections(),
    staleTime: 60_000,
  });
}

/**
 * The effective subject's candidate profile for one election, plus its version
 * history.
 *
 * Writes are append-only: saving never overwrites, it adds v(N+1). Once the
 * election reports `complete` the indexer rejects writes with 409
 * election_complete, so callers should disable the form rather than let a save
 * fail — see `isWritable` below.
 */
export function useCandidateProfile(electionId: string) {
  const { effectiveAddress } = useSiwe();
  const queryClient = useQueryClient();

  const query = useQuery<MyCandidateProfile>({
    queryKey: siweKeys.candidateProfile(effectiveAddress, electionId),
    // Only the subject can be unresolved here: `electionId` is required, so
    // callers pick an election before rendering rather than passing null and
    // making every use of it defend against that.
    queryFn: effectiveAddress
      ? () => siweApi.getMyCandidateProfile(electionId)
      : skipToken,
    staleTime: 30_000,
  });

  const save = useMutation({
    mutationFn: (fields: CandidateProfileFields) =>
      siweApi.putCandidateProfile(electionId, fields),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: siweKeys.candidateProfile(effectiveAddress, electionId),
      }),
  });

  return {
    current: query.data?.current ?? null,
    versions: query.data?.versions ?? [],
    isLoading: query.isLoading,
    error: query.error as Error | null,
    save: save.mutateAsync,
    isSaving: save.isPending,
    saveError: save.error as Error | null,
  };
}

/**
 * Public read of any address's candidate profile. For a completed election the
 * indexer freezes this to the last version written before it closed, so it is a
 * historical view rather than the current draft.
 */
export function usePublicCandidateProfile(
  electionId: string | null,
  address: string
) {
  return useQuery<CandidateProfileVersion | null>({
    queryKey: siweKeys.publicCandidateProfile(electionId, address),
    // The election is discovered asynchronously (a contender page is addressed
    // only by address), so this waits for it rather than guessing.
    queryFn: electionId
      ? () => siweApi.getPublicCandidateProfile(electionId, address)
      : skipToken,
    staleTime: 60_000,
  });
}
