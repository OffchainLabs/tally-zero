"use client";

import {
  skipToken,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { siweApi } from "@/lib/siwe/client";
import { siweKeys } from "@/lib/siwe/keys";
import type { Draft, DraftFields, DraftSummary } from "@/lib/siwe/types";

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

/**
 * The drafts list for the current effective subject. Kept apart from the
 * mutations so a component that only saves (the proposal form's dialog) does
 * not subscribe to, and so fetch, a list it never shows.
 */
export function useDraftsList() {
  const subject = useDraftSubject();

  const list = useQuery<DraftSummary[]>({
    queryKey: siweKeys.drafts(subject),
    queryFn: subject ? () => siweApi.listDrafts() : skipToken,
    staleTime: 30_000,
  });

  return {
    drafts: list.data ?? [],
    isLoading: list.isLoading,
    error: list.error as Error | null,
  };
}

/** Create, update, publish, and delete drafts for the current effective subject. */
export function useDraftMutations() {
  const subject = useDraftSubject();
  const queryClient = useQueryClient();

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

/** Drafts owned by the current effective subject: the list plus every mutation. */
export function useDrafts() {
  return { ...useDraftsList(), ...useDraftMutations() };
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
