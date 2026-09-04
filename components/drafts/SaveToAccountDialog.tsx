"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { useDraftMutations } from "@/hooks/use-drafts";
import { useSiwe } from "@/hooks/use-siwe";
import {
  deriveDraftTitle,
  getDraftBlocker,
  type ProposalFormSnapshot,
  toDraftFields,
} from "@/lib/drafts/mapping";
import type { Draft } from "@/lib/siwe/types";

/**
 * Saves the proposal form to the signed-in subject's drafts.
 *
 * Deliberately separate from the form's localStorage autosave. The two solve
 * different problems: autosave is crash recovery for anyone with a wallet
 * connected, this is a named, shareable copy that needs a SIWE session. Keeping
 * them apart is what lets the proposal form remain usable without signing in.
 * (When the form is opened on a stored draft it suspends the local autosave, so
 * this button is the only save path in that mode.)
 *
 * The title lives here rather than as a field on the form because it is draft
 * metadata — a proposal's real title is the first heading of its markdown — and
 * a top-level input would imply otherwise.
 */
export function SaveToAccountDialog({
  snapshot,
  draftId,
  initialTitle,
  saveAsNew = false,
  onSaved,
}: {
  snapshot: ProposalFormSnapshot;
  /** Set when the form was opened from an editable draft: save updates it. */
  draftId?: string | null;
  /** The stored draft's name, so an update does not rename it by accident. */
  initialTitle?: string;
  /**
   * The form was opened on a draft that can no longer be edited in place
   * (published or submitted), so saving creates a copy. Only changes the
   * wording; `draftId` should be null in this case.
   */
  saveAsNew?: boolean;
  /**
   * Called with the draft the server returned after a successful create or
   * update. The owner uses it to bind later saves to that draft, so a create
   * is followed by updates rather than more creates.
   */
  onSaved?: (draft: Draft) => void;
}) {
  const { isSignedIn } = useSiwe();
  const { createDraft, patchDraft, isCreating, isPatching } =
    useDraftMutations();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);

  const isSaving = isCreating || isPatching;
  const blocker = getDraftBlocker(snapshot);

  function openWith(next: boolean) {
    if (next) {
      // Updating keeps the stored name; a new draft starts from the derived
      // title, so the common case is one click and typing is opt-in.
      setTitle(initialTitle ?? deriveDraftTitle(snapshot.description));
      setError(null);
    }
    setOpen(next);
  }

  async function save() {
    if (isSaving) return;
    const fields = toDraftFields({ ...snapshot, title });

    try {
      let saved: Draft;
      if (draftId) {
        saved = await patchDraft({ id: draftId, ...fields });
        toast.success("Draft updated.");
      } else {
        saved = await createDraft(fields);
        toast.success("Saved to your drafts.");
      }
      onSaved?.(saved);
      setOpen(false);
    } catch (cause) {
      // Keep the dialog open so the reason sits next to the fields that caused
      // it — a rejected action or a frozen draft is worth reading. (Titles are
      // not validated beyond being non-empty, so a name never fails here.)
      setError(
        cause instanceof Error ? cause.message : "Failed to save draft."
      );
    }
  }

  const buttonLabel = draftId
    ? "Update my draft"
    : saveAsNew
      ? "Save as new draft"
      : "Save to my drafts";

  if (!isSignedIn) {
    return (
      <Button
        type="button"
        variant="outline"
        disabled
        title="Sign in to save drafts to your account."
      >
        {buttonLabel}
      </Button>
    );
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        data-testid="open-save-to-drafts"
        onClick={() => openWith(true)}
        disabled={Boolean(blocker)}
        title={blocker ?? undefined}
      >
        {buttonLabel}
      </Button>

      <Dialog open={open} onOpenChange={openWith}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {draftId
                ? "Update draft"
                : saveAsNew
                  ? "Save as new draft"
                  : "Save to my drafts"}
            </DialogTitle>
            <DialogDescription>
              Stored against your account, so you can come back to it from
              another device or share it for review before submitting on chain.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="draft-title">Draft name</Label>
            <Input
              id="draft-title"
              data-testid="draft-title-input"
              autoComplete="off"
              value={title}
              onChange={(event) => {
                setTitle(event.target.value);
                setError(null);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") save();
              }}
            />
            <p className="text-xs text-muted-foreground">
              Only used to find this draft again — the proposal title comes from
              the first heading in your description.
            </p>
            {error ? (
              <p
                className="text-sm text-destructive"
                data-testid="draft-save-error"
              >
                {error}
              </p>
            ) : null}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button
              data-testid="confirm-save-to-drafts"
              onClick={save}
              disabled={isSaving}
            >
              {isSaving ? "Saving…" : "Save draft"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
