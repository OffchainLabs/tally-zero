"use client";

import { ArrowRight, FileText, Plus } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { SiweAction } from "@/components/siwe/SiweGate";
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
 * Drafts content for /drafts, within the same page shell as /proposals.
 */
export default function MyDraftsList() {
  const { isConnected, isSignedIn, isLoadingSession } = useSiwe();
  const content = isLoadingSession ? (
    <LoadingState />
  ) : !isConnected || !isSignedIn ? (
    <EmptyState title="Sign in to see your drafts" action={<SiweAction />}>
      Drafts are saved to your account from the New Proposal page, so they
      follow you across devices. Anything you have typed there is kept in this
      browser until you save it. Signing in only signs a message; no transaction
      or gas is needed.
    </EmptyState>
  ) : (
    <DraftsContent />
  );

  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted-foreground">
        Proposal drafts saved to your account. Publish one to get a link you can
        circulate for review before submitting on chain.
      </p>
      {content}
    </div>
  );
}


function LoadingState() {
  return (
    <div
      className="glass rounded-2xl h-28 animate-pulse"
      aria-hidden="true"
      data-testid="drafts-loading"
    />
  );
}

function DraftsContent() {
  const { actingAs, effectiveAddress } = useSiwe();
  const { drafts, isLoading, error } = useDraftsList();

  if (isLoading) {
    return <LoadingState />;
  }

  if (error) {
    return (
      <p className="text-sm text-destructive" data-testid="drafts-error">
        {error.message}
      </p>
    );
  }

  const sorted = [...drafts].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt)
  );

  return (
    <div className="space-y-4">
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
      {sorted.length === 0 ? (
        <EmptyState
          title="No drafts yet"
          action={
            <Button asChild size="sm" variant="outline">
              <Link href="/proposal/new">
                <Plus className="h-3.5 w-3.5 mr-1" />
                Start a proposal
              </Link>
            </Button>
          }
        >
          Save a proposal to your drafts from the New Proposal page and it will
          show up here.
        </EmptyState>
      ) : (
        <ul
          className="glass rounded-2xl overflow-clip divide-y divide-border/40"
          data-testid="drafts-list"
        >
          {sorted.map((draft) => (
            <li key={draft.id}>
              <DraftRow draft={draft} />
            </li>
          ))}
        </ul>
      )}
    </div>
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
  action,
}: {
  title: string;
  children: ReactNode;
  action: ReactNode;
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
      {action}
    </div>
  );
}
