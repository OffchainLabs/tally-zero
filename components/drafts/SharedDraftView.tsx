"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Skeleton } from "@/components/ui/Skeleton";
import { useMarkSubmitted, useSharedDraft } from "@/hooks/use-drafts";
import { useSiwe } from "@/hooks/use-siwe";
import {
  getProposalPreviewRehypePlugins,
  getProposalPreviewRemarkPlugins,
} from "@/lib/create-proposal-form-utils";
import { getAddressExplorerUrl, getTxExplorerUrl } from "@/lib/explorer-utils";
import { buildProposalPath } from "@/lib/proposal-url";
import type { Draft } from "@/lib/siwe/types";

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const TX_HASH_RE = /^0x[0-9a-fA-F]{64}$/;

/**
 * Public read of a published draft, addressed by its share slug.
 *
 * Renders outside the SIWE gate on purpose: the slug is unguessable and is
 * itself the capability to read the draft, so requiring a session would defeat
 * the point of sharing it for review.
 */
export function SharedDraftView({ slug }: { slug: string }) {
  const { data: draft, isLoading, error } = useSharedDraft(slug);

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (error || !draft) {
    return (
      <Card variant="glass">
        <CardContent className="pt-6">
          <p
            className="text-sm text-muted-foreground"
            data-testid="shared-draft-error"
          >
            This draft link is not valid. Published drafts can be unpublished by
            their author, and unpublished ones are never readable by slug.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Card variant="glass">
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <CardTitle data-testid="shared-draft-title">{draft.title}</CardTitle>
          <Badge variant="outline">
            {draft.governorType === "CONSTITUTIONAL" ? "Core" : "Treasury"}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">
            By <span className="font-mono">{draft.author}</span> · updated{" "}
            {new Date(draft.updatedAt).toLocaleString()}
          </p>

          <div className="prose prose-sm dark:prose-invert max-w-none break-words prose-headings:text-foreground prose-p:text-muted-foreground prose-a:text-primary prose-strong:text-foreground">
            <ReactMarkdown
              // The canonical plugin pair: rehypeRaw first, then sanitize, so
              // raw HTML in a draft body cannot slip past the schema. This body
              // is authored by anyone who can create a draft, and this page is
              // public, so the ordering is load-bearing.
              rehypePlugins={getProposalPreviewRehypePlugins()}
              remarkPlugins={getProposalPreviewRemarkPlugins()}
            >
              {draft.description}
            </ReactMarkdown>
          </div>
        </CardContent>
      </Card>

      <DraftActions draft={draft} />

      {draft.onchain ? (
        <SubmittedCard draft={draft} />
      ) : (
        <MarkSubmittedForm slug={slug} />
      )}
    </div>
  );
}

function DraftActions({ draft }: { draft: Draft }) {
  if (draft.actions.length === 0) {
    return (
      <Card variant="glass">
        <CardHeader>
          <CardTitle className="text-base">Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No actions yet — this draft is text only.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card variant="glass">
      <CardHeader>
        <CardTitle className="text-base">
          Actions ({draft.actions.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {draft.actions.map((action, index) => (
          <div
            key={`${action.target}-${index}`}
            className="space-y-1 rounded-md border border-white/10 p-3"
          >
            <p className="text-xs text-muted-foreground">Target</p>
            <a
              className="block font-mono text-xs break-all text-primary hover:underline"
              href={getAddressExplorerUrl(action.target)}
              target="_blank"
              rel="noreferrer"
            >
              {action.target}
            </a>
            <p className="text-xs text-muted-foreground">
              Value: <span className="font-mono">{action.value}</span> wei
            </p>
            <p className="text-xs text-muted-foreground">Calldata</p>
            <code className="block break-all font-mono text-xs text-muted-foreground">
              {action.calldata}
            </code>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function SubmittedCard({ draft }: { draft: Draft }) {
  const onchain = draft.onchain;
  if (!onchain) return null;

  return (
    <Card variant="glass">
      <CardHeader>
        <CardTitle className="text-base">Submitted on chain</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-xs text-muted-foreground">
        <p>
          By <span className="font-mono">{onchain.submittedBy}</span> on{" "}
          {new Date(onchain.submittedAt).toLocaleString()}
        </p>
        <a
          className="block text-primary hover:underline"
          href={getTxExplorerUrl(onchain.transactionHash)}
          target="_blank"
          rel="noreferrer"
        >
          View transaction
        </a>
        <a
          className="block text-primary hover:underline"
          href={buildProposalPath({
            proposalId: onchain.proposalId,
            governorAddress: onchain.governorAddress,
          })}
        >
          View proposal
        </a>
      </CardContent>
    </Card>
  );
}

/**
 * Attaches the transaction that put this draft on chain.
 *
 * Reading a shared draft needs no session, but recording a submission does — the
 * route is behind `requireSession`. It does not require *authorship*, though, so
 * the delegate who actually submitted the proposal can record it without the
 * author coming back.
 */
function MarkSubmittedForm({ slug }: { slug: string }) {
  const { isSignedIn } = useSiwe();
  const { markSubmitted, isSubmitting, error } = useMarkSubmitted(slug);
  const [transactionHash, setTransactionHash] = useState("");
  const [governorAddress, setGovernorAddress] = useState("");
  const [proposalId, setProposalId] = useState("");

  const isValid =
    TX_HASH_RE.test(transactionHash.trim()) &&
    ADDRESS_RE.test(governorAddress.trim()) &&
    proposalId.trim() !== "";

  async function submit() {
    if (!isValid || isSubmitting) return;
    try {
      await markSubmitted({
        transactionHash: transactionHash.trim(),
        governorAddress: governorAddress.trim(),
        proposalId: proposalId.trim(),
      });
      toast.success("Recorded — this draft is now marked submitted.");
    } catch {
      // `error` renders below; the inputs stay filled so they can be corrected.
    }
  }

  return (
    <Card variant="glass">
      <CardHeader>
        <CardTitle className="text-base">
          Record an on-chain submission
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          If this proposal has been submitted, link the transaction so anyone
          holding this draft can follow it.
        </p>

        {!isSignedIn ? (
          <p
            className="text-sm text-amber-400"
            data-testid="submit-needs-signin"
          >
            Sign in with your wallet to record a submission. You do not need to
            be the draft&apos;s author.
          </p>
        ) : null}

        <div className="space-y-2">
          <Label htmlFor="draft-tx-hash">Transaction hash</Label>
          <Input
            id="draft-tx-hash"
            data-testid="draft-tx-hash"
            className="font-mono"
            placeholder="0x…"
            autoComplete="off"
            spellCheck={false}
            value={transactionHash}
            onChange={(event) => setTransactionHash(event.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="draft-governor">Governor address</Label>
          <Input
            id="draft-governor"
            data-testid="draft-governor"
            className="font-mono"
            placeholder="0x…"
            autoComplete="off"
            spellCheck={false}
            value={governorAddress}
            onChange={(event) => setGovernorAddress(event.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="draft-proposal-id">Proposal id</Label>
          <Input
            id="draft-proposal-id"
            data-testid="draft-proposal-id"
            className="font-mono"
            autoComplete="off"
            spellCheck={false}
            value={proposalId}
            onChange={(event) => setProposalId(event.target.value)}
          />
        </div>

        {error ? (
          <p
            className="text-sm text-destructive"
            data-testid="draft-submit-error"
          >
            {error.message}
          </p>
        ) : null}

        <Button
          data-testid="mark-submitted"
          onClick={submit}
          disabled={!isSignedIn || !isValid || isSubmitting}
        >
          {isSubmitting ? "Recording…" : "Mark as submitted"}
        </Button>
      </CardContent>
    </Card>
  );
}
