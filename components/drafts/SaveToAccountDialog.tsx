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
import { GOVERNORS } from "@/config/governors";
import { useDraftMutations } from "@/hooks/use-drafts";
import { useProposalEligibility } from "@/hooks/use-proposal-eligibility";
import { useSiwe } from "@/hooks/use-siwe";
import { getProposalEligibilityBlocker } from "@/lib/create-proposal-form-utils";
import {
  deriveDraftTitle,
  getDraftBlocker,
  type ProposalFormSnapshot,
  toDraftFields,
} from "@/lib/drafts/mapping";
import type { Draft } from "@/lib/siwe/types";

/**
 * Saves the proposal form to the signed-in subject's drafts. The form autosaves
 * to this browser on its own; this is the named copy that other devices and
 * the drafts list can see, and the only save path that needs a SIWE session.
 *
 * Only a subject at or above the governor's proposal threshold may save, the
 * subject being the signer or the Safe it acts as. The indexer does not
 * enforce this yet, so the disabled button, with the reason, is the only gate.
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
  const { isSignedIn, effectiveAddress } = useSiwe();
  const { createDraft, patchDraft, isCreating, isPatching } =
    useDraftMutations();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { eligibility, proposalThreshold, isError } = useProposalEligibility(
    snapshot.governorType,
    { address: effectiveAddress }
  );

  const isSaving = isCreating || isPatching;
  // Contents the API would reject first; then the proposal threshold, measured
  // for the subject the draft is stored under. The tooltip is the only place
  // this button explains itself, so it names the amount and a failed read.
  const blocker =
    getDraftBlocker(snapshot) ??
    getProposalEligibilityBlocker(
      eligibility,
      GOVERNORS[snapshot.governorType].name,
      "Saving a draft",
      { proposalThreshold, isError }
    );

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

    try {
      // Inside the try: for the Core Governor this encodes the rows, and the
      // encoder rejects what the trigger's blocker lets through (an
      // unchecksummed target, for one). The reason belongs in the dialog, not
      // in an unhandled rejection.
      const fields = toDraftFields({ ...snapshot, title });
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
