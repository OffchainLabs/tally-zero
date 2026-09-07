"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { SaveToAccountDialog } from "@/components/drafts/SaveToAccountDialog";
import CreateProposalForm, {
  type ServerSaveEvent,
} from "@/components/form/CreateProposalForm";
import { Card, CardContent } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { useDraft } from "@/hooks/use-drafts";
import { useSiwe } from "@/hooks/use-siwe";
import { draftToFormState } from "@/lib/drafts/mapping";
import type { Draft } from "@/lib/siwe/types";

/**
 * Which stored draft the save button writes to, given the draft the page was
 * opened on and the draft the last save returned.
 *
 * The saved draft wins: for an editable draft it is the same record, fresher;
 * for a published or submitted one it is the copy the first save created, and
 * binding to it is what makes the second save an update rather than another
 * copy. Without a save yet, a frozen draft is bound to nothing so the dialog
 * creates, seeded with a title that tells the copy apart in a list.
 *
 * Exported for its tests: the state it reads is only reachable after a save,
 * which the static-markup tests cannot perform.
 */
export function resolveDraftBinding(
  opened: Draft | undefined,
  saved: Draft | null
): {
  isEditable: boolean;
  draftId: string | null;
  initialTitle: string | undefined;
  saveAsNew: boolean;
} {
  // Publishing freezes a draft on the server (PATCH answers 409 not_editable),
  // so a published or submitted draft opens read-only in that sense: its
  // contents still seed the form, but saving creates a copy instead of trying
  // an update that would fail after the user has typed.
  const isEditable = !opened || opened.status === "draft";

  if (saved) {
    return {
      isEditable,
      draftId: saved.id,
      initialTitle: saved.title,
      saveAsNew: false,
    };
  }

  if (!opened) {
    return {
      isEditable,
      draftId: null,
      initialTitle: undefined,
      saveAsNew: false,
    };
  }

  return isEditable
    ? {
        isEditable,
        draftId: opened.id,
        initialTitle: opened.title,
        saveAsNew: false,
      }
    : {
        isEditable,
        draftId: null,
        initialTitle: `${opened.title} (copy)`,
        saveAsNew: true,
      };
}

/** The draft the last save returned, and the ?draft= the page had at the time. */
export interface LastSaved {
  openedOn: string | null;
  draft: Draft;
  serverSave: ServerSaveEvent;
  /** The URL has since reached `draft.id`. */
  moved: boolean;
}

/**
 * Whether the last save still describes the draft on screen, given the current
 * ?draft=. It does when the URL points at the saved draft, and, until the URL
 * has moved there, when it still points at whatever the save was made under
 * (null for the blank form). After the move a null is a fresh blank form again
 * and must not inherit an earlier save.
 *
 * Exported for its tests: the states involved are only reachable after a save.
 */
export function saveAppliesTo(
  lastSaved: LastSaved | null,
  draftId: string | null
): boolean {
  if (!lastSaved) return false;
  if (lastSaved.draft.id === draftId) return true;
  return !lastSaved.moved && lastSaved.openedOn === draftId;
}

/**
 * Wires the proposal form to the server-side drafts API.
 *
 * Everything session-shaped lives here — the search param, the query, the SIWE
 * hooks — so CreateProposalForm needs none of it. With `?draft=<id>` the form is
 * mounted on that draft's contents and saving updates it in place; without one
 * the form autosaves to this browser as it always has, and the first save to
 * the account binds the form to the draft it created and moves the URL to it,
 * so a reload comes back to the same draft.
 */
export function ProposalDraftLoader() {
  const draftId = useSearchParams().get("draft");
  const pathname = usePathname();
  const router = useRouter();
  const { isSignedIn, isLoadingSession, effectiveAddress } = useSiwe();
  const { data: draft, isLoading, error } = useDraft(draftId);

  // The draft the last save returned, remembered with the ?draft= it was made
  // under (and its own id, which the URL moves to after a create) so a later
  // navigation to an unrelated draft does not inherit it. `serverSave` is kept
  // as one object so the form's effect on it fires once per save.
  const [lastSaved, setLastSaved] = useState<LastSaved | null>(null);
  // Note the URL reaching the saved draft. Adjusting state during render on a
  // prop change is the React-sanctioned shape; the nested serverSave object is
  // kept, so the form's effect on it does not fire again.
  if (lastSaved && !lastSaved.moved && lastSaved.draft.id === draftId) {
    setLastSaved({ ...lastSaved, moved: true });
  }
  const saveApplies = saveAppliesTo(lastSaved, draftId);
  const savedDraft = saveApplies ? lastSaved!.draft : null;
  const serverSave = saveApplies ? lastSaved!.serverSave : null;

  // Drafts are session-scoped, so an unauthenticated ?draft= would otherwise
  // fall through to a blank form with no explanation.
  const needsSignIn = Boolean(draftId) && !isLoadingSession && !isSignedIn;

  // Mount the form only once the draft has resolved: seeding initial state is
  // simpler than reconciling a late arrival against what the user has typed.
  //
  // The session has to count as loading too. useDraft stands down with
  // skipToken until the subject is known, and a skipped query is pending but
  // not fetching, so its isLoading is false. Without this the form would mount
  // blank (and restore the browser autosave) before the session resolved, then
  // be unmounted for the skeleton and mounted again on the draft.
  if (draftId && (isLoadingSession || isLoading)) {
    return (
      <Card variant="glass">
        <CardContent className="space-y-3 pt-6">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    );
  }

  const restored = draft ? draftToFormState(draft) : null;
  const binding = resolveDraftBinding(draft, savedDraft);

  return (
    <div className="flex flex-col gap-4">
      {needsSignIn ? (
        <p className="text-sm text-amber-400">
          Sign in to open a saved draft. Starting a blank proposal instead.
        </p>
      ) : draftId && error ? (
        <p className="text-sm text-amber-400">
          That draft could not be loaded — it may have been deleted, or belong
          to a different account. Starting a blank proposal instead.
        </p>
      ) : draft && !binding.isEditable ? (
        // Shown until the first save: that save creates the copy and moves the
        // URL to it, and the copy is an ordinary editable draft from then on.
        <p className="text-sm text-amber-400">
          This draft has been {draft.status}, so it can no longer be edited in
          place. Changes you make here can be saved as a new draft.
        </p>
      ) : null}

      <CreateProposalForm
        initialDraft={restored}
        // The autosave slot is named after the draft on screen, while the save
        // dialog below writes to the binding. They differ for a published or
        // submitted draft before its first save: bound to nothing, but its
        // contents must not share the anonymous form's slot.
        draftId={binding.draftId ?? draft?.id ?? null}
        serverSave={serverSave}
        accountAddress={effectiveAddress}
        renderDraftActions={(snapshot) => (
          <SaveToAccountDialog
            snapshot={snapshot}
            draftId={binding.draftId}
            initialTitle={binding.initialTitle}
            saveAsNew={binding.saveAsNew}
            onSaved={(saved) => {
              setLastSaved({
                openedOn: draftId,
                draft: saved,
                serverSave: {
                  at: Date.now(),
                  address: effectiveAddress,
                  snapshot,
                },
                moved: false,
              });
              // A create (blank form, or a copy of a frozen draft) leaves the
              // URL pointing at nothing or at the original. Move it to the new
              // draft so a reload comes back here. useDraftMutations seeded the
              // new draft's query, so the skeleton gate does not unmount the
              // form while it would otherwise fetch.
              if (saved.id !== draftId) {
                router.replace(
                  `${pathname}?draft=${encodeURIComponent(saved.id)}`
                );
              }
            }}
          />
        )}
      />
    </div>
  );
}
