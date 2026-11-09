"use client";

import {
  skipToken,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { electionsNewestFirst } from "@/lib/election-profile";
import { SiweApiError, siweApi } from "@/lib/siwe/client";
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
    // The session may have switched subjects while the save was in flight.
    // Refresh both views of the profile that was actually saved.
    onSuccess: (version) =>
      Promise.all([
        queryClient.invalidateQueries({
          queryKey: siweKeys.candidateProfile(
            version.address,
            version.electionId
          ),
        }),
        queryClient.invalidateQueries({
          queryKey: siweKeys.publicCandidateProfile(
            version.electionId,
            version.address
          ),
        }),
      ]),
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
 * The newest candidate profile an address has published in any election, and
 * the election it belongs to. For a completed election the indexer freezes the
 * profile to the last version written before it closed.
 *
 * A contender page is addressed only by address, and the static snapshot has
 * no election id, so asking only the newest election would drop a candidate's
 * edits the moment the next election is created. Instead this asks every
 * election and takes the newest one that has a profile. It waits until every
 * newer election has answered, so an older profile never flashes up before a
 * newer one arrives. A failed lookup counts as no profile there.
 *
 * Because of that wait, a failing newer election holds back the whole result
 * for its retries, so a server or network error gets one retry (about 1s)
 * rather than the client default of three (about 7s). A 4xx will not fix
 * itself, so it fails at once. A 404 never gets here: it resolves to null.
 *
 * Each lookup uses `siweKeys.publicCandidateProfile`, the key the editor's
 * save invalidates, so saving refreshes this too.
 */
export function useNewestPublicCandidateProfile(
  elections: ElectionSummary[] | undefined,
  address: string
): {
  profile: CandidateProfileVersion | null;
  election: ElectionSummary | null;
} {
  const ordered = electionsNewestFirst(elections ?? []);

  return useQueries({
    queries: ordered.map((election) => ({
      queryKey: siweKeys.publicCandidateProfile(election.id, address),
      queryFn: () => siweApi.getPublicCandidateProfile(election.id, address),
      staleTime: 60_000,
      retry: (failureCount: number, error: Error) =>
        failureCount < 1 &&
        !(error instanceof SiweApiError && error.status < 500),
    })),
    combine: (results) => {
      for (const [index, result] of results.entries()) {
        if (result.isPending) break;
        if (result.data) {
          return { profile: result.data, election: ordered[index] };
        }
      }
      return { profile: null, election: null };
    },
  });
}
