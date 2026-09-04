"use client";

import { ArrowRight, FileText, Plus } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/Button";
import { useDraftsList } from "@/hooks/use-drafts";
import { useSiwe } from "@/hooks/use-siwe";
import type {
  DraftGovernorType,
  DraftStatus,
  DraftSummary,
} from "@/lib/siwe/types";

const GOVERNOR_LABEL: Record<DraftGovernorType, string> = {
  CONSTITUTIONAL: "Core",
  TREASURY: "Treasury",
};

const STATUS_LABEL: Record<DraftStatus, string> = {
  draft: "Draft",
  published: "Published",
  submitted: "Submitted",
};

/**
 * "My Drafts" tab content: the signed-in subject's server-side drafts, newest
 * first, each opening in the New Proposal form. Published and submitted drafts
 * are frozen on the server, so those open as a copy (the loader handles the
 * fork); the label says so up front.
 *
 * Drafts need a SIWE session, so a signed-out visitor sees a prompt rather
 * than an empty list they might read as "nothing saved".
 */
export default function MyDraftsList() {
  const { isSignedIn, isLoadingSession } = useSiwe();
  const { drafts, isLoading, error } = useDraftsList();

  if (isLoadingSession || (isSignedIn && isLoading)) {
    return (
      <div
        className="glass rounded-2xl h-28 animate-pulse"
        aria-hidden="true"
        data-testid="drafts-loading"
      />
    );
  }

  if (!isSignedIn) {
    return (
      <EmptyState title="Sign in to see your drafts">
        Drafts are saved to your account from the New Proposal page, so they
        follow you across devices.
      </EmptyState>
    );
  }

  if (error) {
    return (
      <p className="text-sm text-destructive" data-testid="drafts-error">
        {error.message}
      </p>
    );
  }

  if (drafts.length === 0) {
    return (
      <EmptyState title="No drafts yet">
        Save a proposal to your drafts from the New Proposal page and it will
        show up here.
      </EmptyState>
    );
  }

  const sorted = [...drafts].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt)
  );

  return (
    <ul className="glass rounded-2xl overflow-clip divide-y divide-border/40">
      {sorted.map((draft) => (
        <li key={draft.id}>
          <DraftRow draft={draft} />
        </li>
      ))}
    </ul>
  );
}

function DraftRow({ draft }: { draft: DraftSummary }) {
  const isEditable = draft.status === "draft";

  return (
    <Link
      href={`/proposal/new?draft=${encodeURIComponent(draft.id)}`}
      className="group flex items-center gap-4 p-4 transition-colors hover:bg-white/[0.03]"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <FileText className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">
          {draft.title}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {GOVERNOR_LABEL[draft.governorType]} · {STATUS_LABEL[draft.status]} ·
          Updated {new Date(draft.updatedAt).toLocaleString()}
        </p>
      </div>
      <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-primary">
        {isEditable ? "Continue editing" : "Open as copy"}
        <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}

function EmptyState({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="glass rounded-2xl px-6 py-12 flex flex-col items-center gap-3 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/5">
        <FileText className="h-5 w-5 text-muted-foreground" />
      </div>
      <div className="space-y-1">
        <h3 className="text-sm font-medium text-foreground">{title}</h3>
        <p className="text-sm text-muted-foreground max-w-sm">{children}</p>
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
