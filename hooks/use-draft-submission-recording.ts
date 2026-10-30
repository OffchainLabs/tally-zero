"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { TransactionReceipt } from "viem";
import { useTransactionReceipt, useWaitForTransactionReceipt } from "wagmi";

import type { ProposalReplacement } from "@/components/form/CreateProposalForm";

import { ARBITRUM_CHAIN_ID } from "@/config/arbitrum-governance";
import {
  DRAFT_SUBMISSION_DISCARD_AFTER_MS,
  draftSubmissionStorageKey,
} from "@/config/storage-keys";
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
  // A draft that loads as submitted shows no recording outcome: the loader's
  // banner already says it was submitted, and "recorded" is for a write that
  // happened in this session.
  const [status, setStatus] = useState<RecordingStatus>(null);
  const [error, setError] = useState<string | null>(null);
  const pendingHash = useRef<string | null>(null);
  const attemptedHash = useRef<string | null>(null);
  const recordingHash = useRef<string | null>(null);
  const [, setDiscardTick] = useState(0);

  const reset = useCallback(() => {
    pendingHash.current = null;
    attemptedHash.current = null;
    setPending(null);
    setError(null);
    setStatus(null);
  }, []);

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
      } else if (
        !saved &&
        pendingHash.current &&
        attemptedHash.current === pendingHash.current
      ) {
        // The hashes agree only while a record is in flight or has failed,
        // so the entry went away because another tab recorded it.
        reset();
      }
    };
    const unsubscribe = subscribePendingSubmission(key, restore);
    restore();
    return unsubscribe;
  }, [key, draft.status, reset]);

  const onProposalSubmitted = useCallback(
    ({
      hash,
      governorAddress,
    }: {
      hash: `0x${string}`;
      governorAddress: string;
    }) => {
      if (draft.status !== "published") return;
      // Persist at broadcast, before either the receipt or the API write.
      pendingHash.current = hash;
      const next = savePendingSubmission(key, {
        transactionHash: hash,
        governorAddress,
      });
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
        if (attemptedHash.current === submission.transactionHash) {
          pendingHash.current = null;
          setStatus("recorded");
        }
        // Clearing notifies this tab's restore too, so settle first.
        clearPendingSubmission(key, submission.transactionHash);
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
      // shared query runs the queryFn of whichever observer most recently set
      // its options, so the onReplaced that fires may belong to the form or to
      // an instance unmounted since; follow the receipt here regardless.
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

  useEffect(() => {
    if (!pending || draft.status !== "submitted") return;
    // The draft was recorded while this hash was pending: by another tab, or
    // by a write here whose response was lost.
    const recorded =
      !!draft.onchain &&
      attemptedHash.current?.toLowerCase() ===
        draft.onchain.transactionHash.toLowerCase();
    reset();
    clearPendingSubmission(key, pending.transactionHash);
    if (recorded) setStatus("recorded");
  }, [draft, pending, key, reset]);

  // Nothing re-renders while the wait polls, so wake once the window passes.
  const discardAt = pending
    ? pending.broadcastAt + DRAFT_SUBMISSION_DISCARD_AFTER_MS
    : null;
  const canDiscard =
    status === "confirming" && discardAt !== null && Date.now() >= discardAt;
  useEffect(() => {
    if (status !== "confirming" || discardAt === null) return;
    const remaining = discardAt - Date.now();
    if (remaining <= 0) return;
    const timer = setTimeout(
      () => setDiscardTick((tick) => tick + 1),
      remaining
    );
    return () => clearTimeout(timer);
  }, [status, discardAt]);
  /** Drop a hash that has waited unconfirmed past the discard window. */
  const discard = () => {
    if (!canDiscard || !pending) return;
    reset();
    clearPendingSubmission(key, pending.transactionHash);
  };

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
    if (checked.kind === "match") {
      await record(checked.submission);
    } else {
      pendingHash.current = null;
      clearPendingSubmission(key, retryHash);
      setError(null);
      setStatus(checked.kind);
    }
  };
  return {
    status,
    error,
    canRetry,
    retry,
    canDiscard,
    discard,
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
