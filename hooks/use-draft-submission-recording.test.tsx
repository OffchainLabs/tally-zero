// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import type { TransactionReceipt } from "viem";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { draftSubmissionStorageKey } from "@/config/storage-keys";
import {
  draft,
  governor,
  proposalId,
  receipt,
  txHash,
} from "@/lib/drafts/submission-fixtures";
import {
  readPendingSubmission,
  savePendingSubmission,
} from "@/lib/drafts/submission-recovery";

import { useDraftSubmissionRecording } from "./use-draft-submission-recording";

const mocks = vi.hoisted(() => ({
  markSubmitted: vi.fn(),
  wait: vi.fn(),
  refetch: vi.fn(),
  refetchReceipt: vi.fn(),
}));
vi.mock("./use-drafts", () => ({
  useMarkSubmitted: () => ({ markSubmitted: mocks.markSubmitted }),
}));
vi.mock("wagmi", () => ({
  useWaitForTransactionReceipt: mocks.wait,
  useTransactionReceipt: () => ({ refetch: mocks.refetchReceipt }),
}));

const published = { ...draft, shareSlug: "slug" };
const key = draftSubmissionStorageKey(draft.id, draft.author);
const pending = { transactionHash: txHash, governorAddress: governor };
const submission = { ...pending, proposalId };
let confirmed: TransactionReceipt | undefined;
let receiptError: Error | null;

function mount() {
  return renderHook(() => useDraftSubmissionRecording(published, draft.author));
}
async function broadcast(view: ReturnType<typeof mount>) {
  await act(async () =>
    view.result.current.onProposalSubmitted({
      hash: txHash,
      governorAddress: governor,
    })
  );
}

describe("draft submission recording", () => {
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
    confirmed = undefined;
    receiptError = null;
    mocks.markSubmitted.mockResolvedValue(undefined);
    mocks.refetchReceipt.mockResolvedValue({ data: undefined });
    mocks.wait.mockImplementation(({ hash }: { hash?: string }) => ({
      data: hash ? confirmed : undefined,
      error: hash ? receiptError : null,
      refetch: mocks.refetch,
    }));
  });
  afterEach(cleanup);

  it("persists before confirmation and recovers after a reload mid-confirmation", async () => {
    const view = mount();
    await broadcast(view);
    expect(readPendingSubmission(key)).toEqual(pending);
    expect(mocks.markSubmitted).not.toHaveBeenCalled();
    view.unmount();
    const reopened = mount();
    expect(reopened.result.current.status).toBe("confirming");
    expect(mocks.wait).toHaveBeenLastCalledWith(
      expect.objectContaining({ hash: txHash })
    );
    confirmed = receipt();
    await act(async () => reopened.rerender());
    expect(mocks.markSubmitted).toHaveBeenCalledExactlyOnceWith(submission);
    expect(reopened.result.current.status).toBe("recorded");
    expect(readPendingSubmission(key)).toBeNull();
    await act(async () => reopened.rerender());
    expect(mocks.markSubmitted).toHaveBeenCalledOnce();
  });
});
