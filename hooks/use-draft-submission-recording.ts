"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useWaitForTransactionReceipt } from "wagmi";

import { ARBITRUM_CHAIN_ID } from "@/config/arbitrum-governance";
import { draftSubmissionStorageKey } from "@/config/storage-keys";
import { checkDraftReceipt } from "@/lib/drafts/submission";
import {
  clearPendingSubmission,
  readPendingSubmission,
  savePendingSubmission,
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
  const { markSubmitted } = useMarkSubmitted(draft.shareSlug);
  const [pending, setPending] = useState<PendingDraftSubmission | null>(null);
  const [status, setStatus] = useState<RecordingStatus>(
    draft.status === "submitted" ? "recorded" : null
  );
  const [error, setError] = useState<string | null>(null);
  const attemptedHash = useRef<string | null>(null);
  const recordingHash = useRef<string | null>(null);

  useEffect(() => {
    if (draft.status !== "published") return;
    const saved = readPendingSubmission(key);
    if (saved) {
      setPending(saved);
      setStatus("confirming");
    }
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
      savePendingSubmission(key, next);
      attemptedHash.current = null;
      setPending(next);
      setError(null);
      setStatus("confirming");
    },
    [key, draft.status]
  );

  const {
    data: awaitedReceipt,
    error: receiptError,
    refetch,
  } = useWaitForTransactionReceipt({
    chainId: ARBITRUM_CHAIN_ID,
    hash: pending?.transactionHash,

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
        if (attemptedHash.current === submission.transactionHash)
          setStatus("recorded");
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
    if (!receipt || !matchesPending) return;
    if (attemptedHash.current === pending.transactionHash) return;
    attemptedHash.current = pending.transactionHash;
    if (receipt.status === "reverted") {
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
      clearPendingSubmission(key, pending.transactionHash);
      setStatus(checked.kind);
    }
  }, [draft, pending, receipt, receiptError, key, record]);

  const canRetry =
    status === "failed" ||
    (status === "receipt-error" && !!pending && !!receiptError);
  const retry = async () => {
    if (status === "receipt-error" && pending && receiptError) {
      setStatus("confirming");
      setError(null);
      const result = await refetch();
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
