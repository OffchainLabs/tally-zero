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
  Draft,
  DraftFields,
  DraftSubmission,
  DraftSummary,
} from "@/lib/siwe/types";

import { useSiwe } from "./use-siwe";

/**
 * The subject every draft read and write belongs to — the signer, or the Safe
 * being acted as. Non-null implies a session, so it is the only gate these
 * queries need.
 *
 * `skipToken` rather than `enabled`: it narrows the value inside the queryFn
 * closure, so nothing here needs a cast or an invented placeholder subject.
 */
function useDraftSubject() {
  return useSiwe().effectiveAddress;
}

/** Drafts owned by the current effective subject. */
export function useDrafts() {
  const subject = useDraftSubject();
  const queryClient = useQueryClient();

  const list = useQuery<DraftSummary[]>({
    queryKey: siweKeys.drafts(subject),
    queryFn: subject ? () => siweApi.listDrafts() : skipToken,
    staleTime: 30_000,
  });

  // Individual drafts nest under the list key, so invalidating the list root
  // refreshes them too — see lib/siwe/keys.ts.
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: siweKeys.drafts(subject) });

  const create = useMutation({
    mutationFn: (fields: DraftFields) => siweApi.createDraft(fields),
    onSuccess: invalidate,
  });

  const patch = useMutation({
    mutationFn: ({ id, ...fields }: { id: string } & Partial<DraftFields>) =>
      siweApi.patchDraft(id, fields),
    onSuccess: invalidate,
  });

  // Publishing is irreversible: it freezes the draft against further edits and
  // mints the share slug. Confirm before calling.
  const publish = useMutation({
    mutationFn: (id: string) => siweApi.publishDraft(id),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (id: string) => siweApi.deleteDraft(id),
    onSuccess: (_result, id) => {
      // Drop the deleted draft outright — invalidating would refetch it into a
      // 404 for anything still observing that key.
      queryClient.removeQueries({ queryKey: siweKeys.draft(subject, id) });
      return invalidate();
    },
  });

  return {
    drafts: list.data ?? [],
    isLoading: list.isLoading,
    error: list.error as Error | null,
    createDraft: create.mutateAsync,
    isCreating: create.isPending,
    patchDraft: patch.mutateAsync,
    isPatching: patch.isPending,
    publishDraft: publish.mutateAsync,
    isPublishing: publish.isPending,
    deleteDraft: remove.mutateAsync,
    isDeleting: remove.isPending,
  };
}

/**
 * One full draft, including description and actions, which the list view omits.
 * Pass null to stand down — used by the proposal form, which only has an id
 * when it was opened with `?draft=`.
 */
export function useDraft(id: string | null) {
  const subject = useDraftSubject();

  return useQuery<Draft>({
    queryKey: siweKeys.draft(subject, id),
    queryFn: subject && id ? () => siweApi.getDraft(id) : skipToken,
    staleTime: 30_000,
  });
}

/**
 * A published draft read by its share slug. No session involved: the slug is
 * itself the capability, which is why this key carries no identity.
 */
export function useSharedDraft(slug: string) {
  return useQuery<Draft>({
    queryKey: siweKeys.sharedDraft(slug),
    queryFn: () => siweApi.getSharedDraft(slug),
    staleTime: 30_000,
  });
}

/**
 * Records the on-chain submission of a published draft.
 *
 * Also unauthenticated — anyone with the link can attach the transaction that
 * submitted it, which is deliberate: the person who submits a draft on chain is
 * often not the person who wrote it.
 */
export function useMarkSubmitted(slug: string) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (onchain: DraftSubmission) =>
      siweApi.markSubmitted(slug, onchain),
    onSuccess: (draft) =>
      queryClient.setQueryData(siweKeys.sharedDraft(slug), draft),
  });

  return {
    markSubmitted: mutation.mutateAsync,
    isSubmitting: mutation.isPending,
    error: mutation.error as Error | null,
  };
}
