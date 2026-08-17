"use client";

import { useSearchParams } from "next/navigation";

import { SaveToAccountDialog } from "@/components/drafts/SaveToAccountDialog";
import CreateProposalForm from "@/components/form/CreateProposalForm";
import { Card, CardContent } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { useDraft } from "@/hooks/use-drafts";
import { useSiwe } from "@/hooks/use-siwe";
import { draftToFormState } from "@/lib/drafts/mapping";

/**
 * Wires the proposal form to the server-side drafts API.
 *
 * Everything session-shaped lives here — the search param, the query, the SIWE
 * hooks — so CreateProposalForm needs none of it. With `?draft=<id>` the form is
 * mounted on that draft's contents and saving updates it in place; without one
 * the form behaves exactly as it always has.
 */
export function ProposalDraftLoader() {
  const draftId = useSearchParams().get("draft");
  const { isSignedIn, isLoadingSession } = useSiwe();
  const { data: draft, isLoading, error } = useDraft(draftId);

  // Drafts are session-scoped, so an unauthenticated ?draft= would otherwise
  // fall through to a blank form with no explanation.
  const needsSignIn = Boolean(draftId) && !isLoadingSession && !isSignedIn;

  // Mount the form only once the draft has resolved: seeding initial state is
  // simpler than reconciling a late arrival against what the user has typed.
  if (draftId && isLoading) {
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
      ) : null}

      <CreateProposalForm
        initialDraft={restored}
        renderDraftActions={(snapshot) => (
          <SaveToAccountDialog
            snapshot={snapshot}
            draftId={draft?.id ?? null}
            initialTitle={draft?.title}
          />
        )}
      />
    </div>
  );
}
