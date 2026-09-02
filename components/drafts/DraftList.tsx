"use client";

import { ExternalLink, Pencil, Share2, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { useDrafts } from "@/hooks/use-drafts";
import { useSiwe } from "@/hooks/use-siwe";
import type { DraftStatus, DraftSummary } from "@/lib/siwe/types";

/**
 * Draft lifecycle, in the order the API moves through it:
 *   draft     → editable, private
 *   published → frozen, readable by anyone holding the share slug
 *   submitted → recorded on chain
 *
 * Publishing and deleting are both irreversible, so each asks for a second
 * click rather than opening a dialog — the confirm lives on the row, which keeps
 * it unambiguous which draft is about to change.
 */
const STATUS_LABEL: Record<DraftStatus, string> = {
  draft: "Draft",
  published: "Published",
  submitted: "Submitted",
};

export function DraftList() {
  const { actingAs, effectiveAddress } = useSiwe();
  const { drafts, isLoading, error } = useDrafts();

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <p className="text-sm text-destructive" data-testid="drafts-error">
        {error.message}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {/* Drafts belong to the effective subject, so acting as a Safe shows a
          different list than the signer's own — say whose it is. */}
      {actingAs ? (
        <p
          className="text-sm text-muted-foreground"
          data-testid="drafts-subject"
        >
          Showing drafts for{" "}
          <span className="font-mono">{effectiveAddress}</span>{" "}
          <span className="text-amber-500">(Safe)</span>
        </p>
      ) : null}

      {drafts.length === 0 ? (
        <Card variant="glass">
          <CardContent className="space-y-3 pt-6">
            <p className="text-sm text-muted-foreground">
              No drafts yet. Start a proposal and use “Save to my drafts” to
              keep it here.
            </p>
            <Button asChild>
              <Link href="/proposal/new">New proposal</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-3" data-testid="drafts-list">
          {drafts.map((draft) => (
            <DraftRow key={draft.id} draft={draft} />
          ))}
        </ul>
      )}
    </div>
  );
}

function DraftRow({ draft }: { draft: DraftSummary }) {
  const { publishDraft, deleteDraft, isPublishing, isDeleting } = useDrafts();
  const { copy, copied } = useCopyToClipboard();
  const [confirming, setConfirming] = useState<"publish" | "delete" | null>(
    null
  );

  const isEditable = draft.status === "draft";
  const shareUrl =
    draft.shareSlug && typeof window !== "undefined"
      ? `${window.location.origin}/drafts/shared/${draft.shareSlug}`
      : null;

  async function run(action: "publish" | "delete") {
    try {
      if (action === "publish") {
        await publishDraft(draft.id);
        toast.success("Draft published — the share link is ready.");
      } else {
        await deleteDraft(draft.id);
        toast.success("Draft deleted.");
      }
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : `Failed to ${action} draft.`
      );
    } finally {
      setConfirming(null);
    }
  }

  return (
    <li>
      <Card variant="glass">
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <CardTitle className="text-base" data-testid="draft-title">
            {draft.title}
          </CardTitle>
          <Badge variant="outline">{STATUS_LABEL[draft.status]}</Badge>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-xs text-muted-foreground">
            {draft.governorType === "CONSTITUTIONAL" ? "Core" : "Treasury"} ·
            updated {new Date(draft.updatedAt).toLocaleString()}
          </p>

          {confirming ? (
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm text-amber-400">
                {confirming === "publish"
                  ? "Publishing freezes this draft against further edits and creates a public share link. This cannot be undone."
                  : "Delete this draft permanently?"}
              </p>
              <Button
                size="sm"
                variant={confirming === "delete" ? "destructive" : "default"}
                data-testid={`confirm-${confirming}`}
                disabled={isPublishing || isDeleting}
                onClick={() => run(confirming)}
              >
                Yes, {confirming}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setConfirming(null)}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {isEditable ? (
                <Button size="sm" variant="outline" asChild>
                  <Link href={`/proposal/new?draft=${draft.id}`}>
                    <Pencil className="mr-1.5 h-3.5 w-3.5" />
                    Open in form
                  </Link>
                </Button>
              ) : null}

              {isEditable ? (
                <Button
                  size="sm"
                  variant="outline"
                  data-testid="publish-draft"
                  onClick={() => setConfirming("publish")}
                >
                  <Share2 className="mr-1.5 h-3.5 w-3.5" />
                  Publish
                </Button>
              ) : null}

              {draft.shareSlug ? (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    data-testid="copy-share-link"
                    onClick={() => {
                      if (shareUrl) copy(shareUrl);
                    }}
                  >
                    {/* `copied` only flips on a successful write, so this cannot
                        claim success when the clipboard is unavailable. */}
                    {copied ? "Copied!" : "Copy share link"}
                  </Button>
                  <Button size="sm" variant="ghost" asChild>
                    <Link href={`/drafts/shared/${draft.shareSlug}`}>
                      <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                      View
                    </Link>
                  </Button>
                </>
              ) : null}

              <Button
                size="sm"
                variant="ghost"
                data-testid="delete-draft"
                onClick={() => setConfirming("delete")}
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                Delete
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </li>
  );
}
