"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useWaitForTransactionReceipt } from "wagmi";

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
  subject: string,
) {
  const key = draftSubmissionStorageKey(draft.id, subject);
  const recorderId = useId();
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
    draft.status === "submitted" ? "recorded" : null,
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
    [key, draft.status],
  );

  const {
    data: awaitedReceipt,
    error: receiptError,
    refetch,
  } = useWaitForTransactionReceipt({
    chainId: ARBITRUM_CHAIN_ID,
    hash: pending?.transactionHash,
    // The form also waits for this hash. Give each query its own replacement
    // callback; viem still shares the underlying transaction observer.
    scopeKey: `${key}:${recorderId}`,
    onReplaced: ({ reason, transactionReceipt }) => {
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
          "Proposal transaction was cancelled. The draft was not marked submitted.",
        );
      } else {
        onProposalSubmitted({
          hash: transactionReceipt.transactionHash,
          governorAddress: pending.governorAddress,
        });
      }
    },
  });

  const receipt = awaitedReceipt;

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
    [key, markSubmitted],
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
    if (!receipt || !matchesPending) return;
    if (attemptedHash.current === pending.transactionHash) return;
    attemptedHash.current = pending.transactionHash;
    if (receipt.status === "reverted") {
      pendingHash.current = null;
      clearPendingSubmission(key, pending.transactionHash);
      setPending(null);
      setStatus("receipt-error");
      setError(
        "Proposal transaction reverted. The draft was not marked submitted.",
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
  }, [draft, pending, receipt, receiptError, key, record]);

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
        setStatus("receipt-error");
        setError(getErrorMessage(result.error, "confirm proposal"));
      }
      return;
    }
    if (!receipt || status !== "failed") return;
    const checked = checkDraftReceipt(receipt, draft);
    if (checked.kind === "match") await record(checked.submission);
  };
  return { status, error, canRetry, retry, onProposalSubmitted };
}
