"use client";

import { ArrowRight, FileText, Plus } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { STORAGE_KEYS } from "@/config/storage-keys";
import {
  parseProposalDraft,
  type RestoredProposalDraft,
} from "@/lib/create-proposal-form-utils";
import { Button } from "@components/ui/Button";

/** Pull a human-readable title from the first non-empty line of the markdown body. */
function draftTitle(description: string): string {
  const firstLine = description
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  if (!firstLine) return "Untitled draft";
  return firstLine.replace(/^#+\s*/, "").slice(0, 120);
}

/**
 * "My Drafts" tab content. Surfaces the locally autosaved proposal draft (if any)
 * as a resume card linking back to the New Proposal form; otherwise an empty state.
 */
export default function MyDraftsList() {
  const [draft, setDraft] = useState<RestoredProposalDraft | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- SSR hydration from localStorage */
    try {
      setDraft(
        parseProposalDraft(
          window.localStorage.getItem(STORAGE_KEYS.PROPOSAL_DRAFT)
        )
      );
    } catch {
      // Storage can be unavailable in privacy-restricted contexts.
    }
    setHydrated(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  if (!hydrated) {
    return (
      <div
        className="glass rounded-2xl h-28 animate-pulse"
        aria-hidden="true"
      />
    );
  }

  if (!draft) {
    return (
      <div className="glass rounded-2xl px-6 py-12 flex flex-col items-center gap-3 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/5">
          <FileText className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="space-y-1">
          <h3 className="text-sm font-medium text-foreground">No drafts yet</h3>
          <p className="text-sm text-muted-foreground max-w-sm">
            Drafts you start on the New Proposal page are saved here
            automatically.
          </p>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link href="/proposal/new">
            <Plus className="h-3.5 w-3.5 mr-1" />
            Start a proposal
          </Link>
        </Button>
      </div>
    );
  }

  const title = draftTitle(draft.description);
  const actionCount = draft.actions.length;
  const savedAt = new Date(draft.savedAt);

  return (
    <div className="glass rounded-2xl overflow-clip">
      <Link
        href="/proposal/new"
        className="group flex items-center gap-4 p-4 transition-colors hover:bg-white/[0.03]"
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <FileText className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">
            {title}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {draft.governorType === "core" ? "Core" : "Treasury"} ·{" "}
            {actionCount} action{actionCount === 1 ? "" : "s"} · Saved{" "}
            {savedAt.toLocaleString()}
          </p>
        </div>
        <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-primary">
          Continue editing
          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
        </span>
      </Link>
    </div>
  );
}
