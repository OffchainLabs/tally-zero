// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { draftSubmissionStorageKey } from "@/config/storage-keys";
import {
  draft,
  governor,
  proposalId,
  receipt,
  txHash,
} from "@/lib/drafts/submission-fixtures";
import { readPendingSubmission } from "@/lib/drafts/submission-recovery";

import {
  useDraftSubmissionRecording,
  type RecordableDraft,
} from "./use-draft-submission-recording";

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
const published: RecordableDraft = { ...draft, shareSlug: "slug" };
const mount = (initial: RecordableDraft = published) =>
  renderHook(
    ({ draft }: { draft: RecordableDraft }) =>
      useDraftSubmissionRecording(draft, draft.author),
    { initialProps: { draft: initial } }
  );
async function broadcast(view: ReturnType<typeof mount>) {
  await act(async () =>
    view.result.current.onProposalSubmitted({
      hash: txHash,
      governorAddress: governor,
    })
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  const entries = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => entries.set(key, value),
      removeItem: (key: string) => entries.delete(key),
    },
  });
  mocks.wait.mockImplementation(({ hash }: { hash?: string }) => ({
    data: hash ? receipt() : undefined,
    error: null,
  }));
});
afterEach(cleanup);

it("resets a second instance's failed recording once the first clears the entry", async () => {
  let finishAccepted!: () => void;
  mocks.markSubmitted
    .mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishAccepted = resolve;
        })
    )
    .mockRejectedValueOnce(new Error("Draft already submitted"));
  const first = mount();
  const second = mount();
  await broadcast(first);
  // Both followed the broadcast and both posted; the server accepted one.
  expect(mocks.markSubmitted).toHaveBeenCalledTimes(2);
  const accepted = first.result.current.status === "recording" ? first : second;
  const rejected = accepted === first ? second : first;
  expect(accepted.result.current.status).toBe("recording");
  expect(rejected.result.current.status).toBe("failed");
  await act(async () => finishAccepted());
  expect(accepted.result.current.status).toBe("recorded");
  expect(readPendingSubmission(key)).toBeNull();
  expect(rejected.result.current.status).toBeNull();
  expect(rejected.result.current.error).toBeNull();
  expect(rejected.result.current.canRetry).toBe(false);
});

it.each([
  ["the attempted transaction", txHash, "recorded"],
  ["another transaction", `0x${"cd".repeat(32)}`, null],
])(
  "settles a failed recording when the draft refetches as submitted by %s",
  async (_, transactionHash, settled) => {
    mocks.markSubmitted.mockRejectedValue(new Error("Response lost"));
    const view = mount();
    await broadcast(view);
    expect(view.result.current.status).toBe("failed");
    expect(readPendingSubmission(key)).toMatchObject(pending);
    await act(async () =>
      view.rerender({
        draft: {
          ...published,
          status: "submitted",
          onchain: {
            transactionHash,
            governorAddress: governor,
            proposalId,
            submittedBy: draft.author,
            submittedAt: "2026-10-29T12:00:00Z",
          },
        },
      })
    );
    expect(readPendingSubmission(key)).toBeNull();
    expect(view.result.current.status).toBe(settled);
    expect(view.result.current.error).toBeNull();
    expect(view.result.current.canRetry).toBe(false);
    expect(mocks.markSubmitted).toHaveBeenCalledOnce();
  }
);

it("reports a receipt that no longer matches the draft when recording is retried", async () => {
  mocks.markSubmitted.mockRejectedValue(new Error("Service unavailable"));
  const view = mount();
  await broadcast(view);
  expect(view.result.current.status).toBe("failed");
  // The draft no longer hashes to the proposal the receipt created.
  await act(async () =>
    view.rerender({ draft: { ...published, description: "# Edited" } })
  );
  expect(view.result.current.status).toBe("failed");
  await act(async () => view.result.current.retry());
  expect(view.result.current.status).toBe("different");
  expect(view.result.current.error).toBeNull();
  expect(view.result.current.canRetry).toBe(false);
  expect(readPendingSubmission(key)).toBeNull();
  expect(mocks.markSubmitted).toHaveBeenCalledOnce();
});
