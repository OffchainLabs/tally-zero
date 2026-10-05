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

  return { status, error, canRetry: false, retry: async () => {}, onProposalSubmitted };
}
