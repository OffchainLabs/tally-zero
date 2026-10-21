"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { TransactionReceipt } from "viem";
import { useTransactionReceipt, useWaitForTransactionReceipt } from "wagmi";

import type { ProposalReplacement } from "@/components/form/CreateProposalForm";

import { ARBITRUM_CHAIN_ID } from "@/config/arbitrum-governance";
import { draftSubmissionStorageKey } from "@/config/storage-keys";
import { checkDraftReceipt } from "@/lib/drafts/submission";
import {
  clearPendingSubmission,
  readPendingSubmission,
  savePendingSubmission,
  subscribePendingSubmission,
  type PendingDraftSubmission,
} from "@/lib/drafts/submission-recovery";
import { getErrorMessage } from "@/lib/error-utils";
import type { Draft, DraftSubmission } from "@/lib/siwe/types";

import { useMarkSubmitted } from "./use-drafts";

export type RecordableDraft = Draft & { shareSlug: string };
type RecordingStatus =
  | "confirming"
  | "recording"
  | "recorded"
  | "different"
  | "missing"
  | "failed"
  | "receipt-error"
  | null;

/** Mount under a key scoped to the draft and signed-in subject. */
export function useDraftSubmissionRecording(
  draft: RecordableDraft,
  subject: string
) {
  const key = draftSubmissionStorageKey(draft.id, subject);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const { markSubmitted } = useMarkSubmitted(draft.shareSlug);
  const [pending, setPending] = useState<PendingDraftSubmission | null>(null);
  const [status, setStatus] = useState<RecordingStatus>(
    draft.status === "submitted" ? "recorded" : null
  );
  const [error, setError] = useState<string | null>(null);
  const pendingHash = useRef<string | null>(null);
  const attemptedHash = useRef<string | null>(null);
  const recordingHash = useRef<string | null>(null);

  useEffect(() => {
    if (draft.status !== "published") return;
    const restore = () => {
      const saved = readPendingSubmission(key);
      if (saved && saved.transactionHash !== pendingHash.current) {
        pendingHash.current = saved.transactionHash;
        attemptedHash.current = null;
        setPending(saved);
        setError(null);
        setStatus("confirming");
      }
    };
    const unsubscribe = subscribePendingSubmission(key, restore);
    restore();
    return unsubscribe;
  }, [key, draft.status]);

  const onProposalSubmitted = useCallback(
    ({
      hash,
      governorAddress,
    }: {
      hash: `0x${string}`;
      governorAddress: string;
    }) => {
      if (draft.status !== "published") return;
      const next = { transactionHash: hash, governorAddress };
      // Persist at broadcast, before either the receipt or the API write.
      pendingHash.current = hash;
      savePendingSubmission(key, next);
      attemptedHash.current = null;
      setPending(next);
      setError(null);
      setStatus("confirming");
    },
    [key, draft.status]
  );

  /** Follow a wallet replacement of the pending transaction. */
  const onProposalReplaced = useCallback(
    ({ reason, transactionReceipt }: ProposalReplacement) => {
      if (
        !mounted.current ||
        !pending ||
        pendingHash.current !== pending.transactionHash
      )
        return;
      const saved = readPendingSubmission(key);
      if (saved && saved.transactionHash !== pending.transactionHash) return;
      clearPendingSubmission(key, pending.transactionHash);
      if (reason === "cancelled") {
        setPending(null);
        setStatus("receipt-error");
        setError(
          "Proposal transaction was cancelled. The draft was not marked submitted."
        );
      } else {
        onProposalSubmitted({
          hash: transactionReceipt.transactionHash,
          governorAddress: pending.governorAddress,
        });
      }
    },
    [key, pending, onProposalSubmitted]
  );

  const {
    data: awaitedReceipt,
    error: receiptError,
    refetch,
  } = useWaitForTransactionReceipt({
    chainId: ARBITRUM_CHAIN_ID,
    hash: pending?.transactionHash,
    // The form waits for this hash too, and both waits must share one wagmi
    // query. viem keys its receipt observer by hash alone, and with wagmi's
    // zero timeout a second concurrent wait leaves a listener behind that
    // hangs every later wait on the hash: retries, refetch, the raw receipt
    // fallback. The form forwards replacements it detects to onProposalReplaced.
    onReplaced: onProposalReplaced,
  });

  // wagmi's wait action throws for reverted receipts. Read the raw receipt
  // after an error to distinguish a verified revert from an RPC outage.
  const { data: rawReceipt, refetch: refetchReceipt } = useTransactionReceipt({
    chainId: ARBITRUM_CHAIN_ID,
    hash: pending?.transactionHash,
    query: { enabled: !!pending && !!receiptError, retry: false },
  });
  const receipt = awaitedReceipt ?? rawReceipt;

  const record = useCallback(
    async (submission: DraftSubmission) => {
      if (recordingHash.current) return;
      recordingHash.current = submission.transactionHash;
      setStatus("recording");
      setError(null);
      try {
        await markSubmitted(submission);
        clearPendingSubmission(key, submission.transactionHash);
        if (attemptedHash.current === submission.transactionHash) {
          pendingHash.current = null;
          setStatus("recorded");
        }
      } catch (cause) {
        if (attemptedHash.current === submission.transactionHash) {
          setStatus("failed");
          setError(getErrorMessage(cause, "record draft submission"));
        }
      } finally {
        recordingHash.current = null;
      }
    },
    [key, markSubmitted]
  );

  useEffect(() => {
    if (!pending || draft.status !== "published") return;
    const matchesPending =
      receipt?.transactionHash.toLowerCase() ===
      pending.transactionHash.toLowerCase();
    if (receiptError && !matchesPending) {
      // An RPC error or timeout does not prove the transaction failed.
      // Keep its hash so verification can be retried here or after reopening.
      setStatus("receipt-error");
      setError(getErrorMessage(receiptError, "confirm proposal"));
      return;
    }
    if (!receipt) return;
    if (!matchesPending) {
      // viem resolves a replacement's receipt under the replaced hash. The
      // shared query's onReplaced belongs to whichever hook started the fetch,
      // which may be an instance unmounted since, so follow the receipt here.
      onProposalReplaced({
        reason: looksCancelled(receipt) ? "cancelled" : "replaced",
        transactionReceipt: receipt,
      });
      return;
    }
    if (attemptedHash.current === pending.transactionHash) return;
    attemptedHash.current = pending.transactionHash;
    if (receipt.status === "reverted") {
      pendingHash.current = null;
      clearPendingSubmission(key, pending.transactionHash);
      setPending(null);
      setStatus("receipt-error");
      setError(
        "Proposal transaction reverted. The draft was not marked submitted."
      );
      return;
    }
    const checked = checkDraftReceipt(receipt, draft);
    if (checked.kind === "match") {
      void record(checked.submission);
    } else {
      pendingHash.current = null;
      clearPendingSubmission(key, pending.transactionHash);
      setStatus(checked.kind);
    }
  }, [draft, pending, receipt, receiptError, key, record, onProposalReplaced]);

  const canRetry =
    status === "failed" ||
    (status === "receipt-error" && !!pending && !!receiptError);
  const retry = async () => {
    if (!pending || pendingHash.current !== pending.transactionHash) return;
    const retryHash = pending.transactionHash;
    if (status === "receipt-error" && pending && receiptError) {
      setStatus("confirming");
      setError(null);
      const result = await refetch();
      if (pendingHash.current !== retryHash) return;
      if (result.error) {
        const verified = await refetchReceipt();
        if (pendingHash.current !== retryHash) return;
        if (!verified.data) {
          setStatus("receipt-error");
          setError(getErrorMessage(result.error, "confirm proposal"));
        }
      }
      return;
    }
    if (!receipt || status !== "failed") return;
    const checked = checkDraftReceipt(receipt, draft);
    if (checked.kind === "match") await record(checked.submission);
  };
  return {
    status,
    error,
    canRetry,
    retry,
    onProposalSubmitted,
    onProposalReplaced,
  };
}

/** A wallet cancellation is a zero-value self-transfer, so it emits no logs. */
function looksCancelled(receipt: TransactionReceipt) {
  return (
    receipt.logs.length === 0 &&
    receipt.to !== null &&
    receipt.from.toLowerCase() === receipt.to.toLowerCase()
  );
}
