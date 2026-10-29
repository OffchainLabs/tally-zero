// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import {
  DRAFT_SUBMISSION_DISCARD_AFTER_MS,
  draftSubmissionStorageKey,
} from "@/config/storage-keys";
import {
  draft,
  governor,
  receipt,
  txHash,
} from "@/lib/drafts/submission-fixtures";
import {
  readPendingSubmission,
  savePendingSubmission,
} from "@/lib/drafts/submission-recovery";

import { useDraftSubmissionRecording } from "./use-draft-submission-recording";

const mocks = vi.hoisted(() => ({
  wait: vi.fn(),
  markSubmitted: vi.fn(),
}));
vi.mock("./use-drafts", () => ({
  useMarkSubmitted: () => ({ markSubmitted: mocks.markSubmitted }),
}));
vi.mock("wagmi", () => ({
  useWaitForTransactionReceipt: mocks.wait,
  useTransactionReceipt: () => ({ refetch: vi.fn() }),
}));

const key = draftSubmissionStorageKey(draft.id, draft.author);
const pending = { transactionHash: txHash, governorAddress: governor };
const mount = () =>
  renderHook(() =>
    useDraftSubmissionRecording({ ...draft, shareSlug: "slug" }, draft.author)
  );

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-29T12:00:00Z"));
  const entries = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => entries.set(key, value),
      removeItem: (key: string) => entries.delete(key),
    },
  });
  // The hash never confirms.
  mocks.wait.mockReturnValue({ data: undefined, error: null });
  mocks.markSubmitted.mockResolvedValue(undefined);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it("offers to discard a hash only once it has waited past the window", async () => {
  const view = mount();
  await act(async () =>
    view.result.current.onProposalSubmitted({
      hash: txHash,
      governorAddress: governor,
    })
  );
  expect(view.result.current.status).toBe("confirming");
  expect(view.result.current.canDiscard).toBe(false);
  await act(async () =>
    vi.advanceTimersByTime(DRAFT_SUBMISSION_DISCARD_AFTER_MS - 1)
  );
  expect(view.result.current.canDiscard).toBe(false);
  await act(async () => vi.advanceTimersByTime(1));
  expect(view.result.current.canDiscard).toBe(true);
});

it("counts a reopened hash from its broadcast, not from the reopening", async () => {
  savePendingSubmission(key, pending);
  vi.setSystemTime(Date.now() + DRAFT_SUBMISSION_DISCARD_AFTER_MS);
  const view = mount();
  await act(async () => {});
  expect(view.result.current.status).toBe("confirming");
  expect(view.result.current.canDiscard).toBe(true);
});

it("discards the hash, clears recovery and stops waiting on it", async () => {
  savePendingSubmission(key, pending);
  vi.setSystemTime(Date.now() + DRAFT_SUBMISSION_DISCARD_AFTER_MS);
  const view = mount();
  await act(async () => {});
  await act(async () => view.result.current.discard());
  expect(readPendingSubmission(key)).toBeNull();
  expect(view.result.current.status).toBeNull();
  expect(view.result.current.error).toBeNull();
  expect(view.result.current.canDiscard).toBe(false);
  expect(mocks.wait).toHaveBeenLastCalledWith(
    expect.objectContaining({ hash: undefined })
  );
  expect(mocks.markSubmitted).not.toHaveBeenCalled();
});

it("keeps a hash that is still being recorded", async () => {
  mocks.wait.mockReturnValue({ data: receipt(), error: null });
  mocks.markSubmitted.mockReturnValue(new Promise(() => {}));
  const view = mount();
  await act(async () =>
    view.result.current.onProposalSubmitted({
      hash: txHash,
      governorAddress: governor,
    })
  );
  expect(view.result.current.status).toBe("recording");
  await act(async () =>
    vi.advanceTimersByTime(DRAFT_SUBMISSION_DISCARD_AFTER_MS)
  );
  expect(view.result.current.canDiscard).toBe(false);
  await act(async () => view.result.current.discard());
  expect(readPendingSubmission(key)).toMatchObject(pending);
  expect(view.result.current.status).toBe("recording");
});
