"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";
import { TransactionReceiptNotFoundError } from "viem";
import { useTransactionReceipt } from "wagmi";

import { PayloadView } from "@/components/payload";
import { SiweGate } from "@/components/siwe/SiweGate";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Skeleton } from "@/components/ui/Skeleton";
import { ARBITRUM_CHAIN_ID } from "@/config/arbitrum-governance";
import { GOVERNORS } from "@/config/governors";
import { useMarkSubmitted, useSharedDraft } from "@/hooks/use-drafts";
import { useSiwe } from "@/hooks/use-siwe";
import { addressesEqual, TX_HASH_REGEX } from "@/lib/address-utils";
import {
  getProposalPreviewRehypePlugins,
  getProposalPreviewRemarkPlugins,
} from "@/lib/create-proposal-form-utils";
import { fromDraftGovernorType } from "@/lib/drafts/mapping";
import { checkDraftReceipt } from "@/lib/drafts/submission";
import { getAddressExplorerUrl, getTxExplorerUrl } from "@/lib/explorer-utils";
import { buildProposalPath } from "@/lib/proposal-url";
import { SiweApiError } from "@/lib/siwe/client";
import type { Draft } from "@/lib/siwe/types";

// Hoisted so react-markdown sees the same arrays on every render, as
// MarkdownEditor does. The order inside is load-bearing: rehypeRaw first, then
// sanitize, so raw HTML in a draft body cannot slip past the schema. This body
// is authored by anyone who can create a draft, and this page is public.
const REHYPE_PLUGINS = getProposalPreviewRehypePlugins();
const REMARK_PLUGINS = getProposalPreviewRemarkPlugins();

/**
 * Public read of a published draft, addressed by its share slug.
 *
 * Renders outside the SIWE gate on purpose: the slug is unguessable and is
 * itself the capability to read the draft, so requiring a session would defeat
 * the point of sharing it for review.
 */
export function SharedDraftView({ slug }: { slug: string }) {
  const { data: draft, isPending, error } = useSharedDraft(slug);
  const { effectiveAddress } = useSiwe();

  useEffect(() => {
    if (error && !(error instanceof SiweApiError && error.status === 404)) {
      console.error("Could not load shared draft:", error);
    }
  }, [error]);

  // isPending, not isLoading: a query paused for lack of a network connection
  // is pending but not fetching, and must keep the skeleton rather than fall
  // through to the error card and call the link invalid.
  if (isPending) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (error || !draft) {
    // Only a 404 means the link itself is bad. Anything else (the proxy's 502
    // or 503, a network failure) is an outage, and calling it an invalid link
    // would tell every reviewer the draft had been revoked.
    const isNotFound = error instanceof SiweApiError && error.status === 404;
    return (
      <Card variant="glass">
        <CardContent className="pt-6">
          <p
            className="text-sm text-muted-foreground"
            data-testid="shared-draft-error"
          >
            {isNotFound
              ? "This draft link is not valid. Only published drafts are readable by slug."
              : "Could not load this draft. Please try again later."}
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
            By{" "}
            <a
              className="break-all font-mono text-primary hover:underline"
              href={getAddressExplorerUrl(draft.author)}
              target="_blank"
              rel="noopener noreferrer"
            >
              {draft.author}
            </a>{" "}
            · updated {new Date(draft.updatedAt).toLocaleString()}
          </p>

          <div className="prose prose-sm dark:prose-invert max-w-none break-words prose-headings:text-foreground prose-p:text-muted-foreground prose-a:text-primary prose-strong:text-foreground">
            <ReactMarkdown
              rehypePlugins={REHYPE_PLUGINS}
              remarkPlugins={REMARK_PLUGINS}
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
        <Card variant="glass">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
            <p className="text-sm text-muted-foreground">
              No on-chain submission has been recorded for this draft.
            </p>
            {draft.status === "published" &&
              addressesEqual(effectiveAddress, draft.author) && (
                <Button size="sm" asChild>
                  <Link
                    href={`/proposal/new?draft=${encodeURIComponent(draft.id)}`}
                  >
                    Open to submit on chain
                  </Link>
                </Button>
              )}
          </CardContent>
          <CardContent>
            <SiweGate connectDescription="Connect your wallet to sign in and record this draft's on-chain submission.">
              <MarkSubmittedForm slug={slug} draft={draft} />
            </SiweGate>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/**
 * The draft's actions, rendered with the same PayloadView the proposal page
 * uses for "Proposal Payload", so a reviewer sees decoded calldata and the
 * governance execution route exactly as they will once the proposal is on
 * chain. Read-only: calldata overrides are a nerd-mode feature of live
 * proposals and have no meaning for a draft.
 */
function DraftActions({ draft }: { draft: Draft }) {
  const governorAddress =
    GOVERNORS[fromDraftGovernorType(draft.governorType)].address;

  return (
    <Card variant="glass">
      <CardHeader>
        <CardTitle className="text-base">
          Proposal Payload
          {draft.actions.length > 0 && ` (${draft.actions.length})`}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {draft.actions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No actions yet — this draft is text only.
          </p>
        ) : (
          <PayloadView
            targets={draft.actions.map((action) => action.target)}
            values={draft.actions.map((action) => action.value)}
            calldatas={draft.actions.map((action) => action.calldata)}
            governorAddress={governorAddress}
          />
        )}
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

type ReceiptVerification =
  | "checking"
  | "not-found"
  | "error"
  | "reverted"
  | "different"
  | "missing"
  | "id-mismatch"
  | "match";

function receiptCopy(
  verification: Exclude<ReceiptVerification, "match">,
  governorName: string,
  receiptProposalId: string | null
): string {
  switch (verification) {
    case "checking":
      return "Checking the transaction…";
    case "not-found":
      return "No receipt found for this hash yet. If it was just sent, wait for it to confirm, then retry.";
    case "error":
      return "Could not read this transaction.";
    case "reverted":
      return "This transaction reverted, so it created no proposal.";
    case "different":
      return "This transaction created a different proposal than this draft. Check the hash.";
    case "missing":
      return `No ProposalCreated event from the ${governorName} was found in this transaction.`;
    case "id-mismatch":
      return `This transaction created proposal ${receiptProposalId}, not the id entered. Check the proposal id.`;
  }
}

/**
 * Attaches the transaction that put this draft on chain.
 *
 * Any signed-in user may record it, not just the author, matching the route:
 * whoever submits a proposal is often not its author, and requiring the author
 * to come back and record it would leave most drafts permanently marked
 * unsubmitted. The session is still required, because the server records who
 * made the entry. Rendered behind SiweGate for that reason.
 */
function MarkSubmittedForm({ slug, draft }: { slug: string; draft: Draft }) {
  const { markSubmitted, isSubmitting, error } = useMarkSubmitted(slug);
  const [transactionHash, setTransactionHash] = useState("");
  const [proposalId, setProposalId] = useState("");

  // The governor is the draft's, not a field: the server accepts any address
  // and a submitted draft can't be re-recorded, so a typed one would send
  // "View proposal" to the wrong governor for good.
  const governor = GOVERNORS[fromDraftGovernorType(draft.governorType)];

  // Mirrors the server's validators so a rejection is never a surprise, except
  // the hash: the server only checks it is hex, and a short one would stick,
  // since a submitted draft can't be re-recorded. viem's isHash rounds size up
  // and passes 63 digits, hence the exact-length regex.
  const trimmedHash = transactionHash.trim();
  const trimmedId = proposalId.trim();
  const hashOk = TX_HASH_REGEX.test(trimmedHash);
  const idOk = /^\d+$/.test(trimmedId);

  // The server stores whatever it is sent, so a wrong but well-formed hash or
  // a mistyped id would link this draft to the wrong proposal for good. Read
  // the receipt once the hash is well-formed and hold submit until it carries
  // this draft's ProposalCreated. The raw receipt, not the wait: the hash was
  // typed, so it is normally mined already, and the wait throws on a revert
  // where the raw read returns the reverted status to show. No retries, so a
  // typo surfaces as "not found" at once rather than after the backoff.
  const {
    data: receipt,
    error: receiptError,
    refetch: refetchReceipt,
  } = useTransactionReceipt({
    chainId: ARBITRUM_CHAIN_ID,
    hash: hashOk ? (trimmedHash as `0x${string}`) : undefined,
    query: { retry: false },
  });
  const check = useMemo(
    () =>
      receipt && receipt.status === "success"
        ? checkDraftReceipt(receipt, draft)
        : null,
    [receipt, draft]
  );
  const verification = ((): ReceiptVerification | null => {
    if (!hashOk) return null;
    if (!receipt) {
      if (!receiptError) return "checking";
      return receiptError instanceof TransactionReceiptNotFoundError
        ? "not-found"
        : "error";
    }
    if (!check) return "reverted";
    if (check.kind !== "match") return check.kind;
    return idOk && check.submission.proposalId !== trimmedId
      ? "id-mismatch"
      : "match";
  })();
  const isValid = idOk && verification === "match";
  const receiptProposalId =
    check?.kind === "match" ? check.submission.proposalId : null;

  async function submit() {
    if (!isValid || isSubmitting) return;
    try {
      await markSubmitted({
        transactionHash: trimmedHash,
        governorAddress: governor.address,
        proposalId: trimmedId,
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
          holding this draft can follow it. Any signed-in wallet may record
          this, not only the author, and the record is permanent.
        </p>

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

        <p
          className="text-xs text-muted-foreground"
          data-testid="draft-governor"
        >
          Governor: {governor.name}{" "}
          <span className="font-mono">{governor.address}</span>
        </p>

        <div className="space-y-2">
          <Label htmlFor="draft-proposal-id">Proposal id</Label>
          <Input
            id="draft-proposal-id"
            data-testid="draft-proposal-id"
            className="font-mono"
            placeholder="Decimal id from the ProposalCreated event"
            autoComplete="off"
            spellCheck={false}
            value={proposalId}
            onChange={(event) => setProposalId(event.target.value)}
          />
        </div>

        {verification && verification !== "match" ? (
          <div className="flex flex-wrap items-center gap-2">
            <p
              className={
                verification === "checking"
                  ? "text-sm text-muted-foreground"
                  : "text-sm text-destructive"
              }
              data-testid="draft-receipt-status"
            >
              {receiptCopy(verification, governor.name, receiptProposalId)}
            </p>
            {verification === "not-found" || verification === "error" ? (
              <Button
                variant="outline"
                size="sm"
                data-testid="draft-receipt-retry"
                onClick={() => refetchReceipt()}
              >
                Retry verification
              </Button>
            ) : null}
          </div>
        ) : null}

        {error ? (
          <p
            className="text-sm text-destructive"
            data-testid="draft-submit-error"
          >
            Could not record this submission. Please try again.
          </p>
        ) : null}

        <Button
          data-testid="mark-submitted"
          onClick={submit}
          disabled={!isValid || isSubmitting}
        >
          {isSubmitting ? "Recording…" : "Mark as submitted"}
        </Button>
      </CardContent>
    </Card>
  );
}
