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

  it("preserves a failed API recording for reopening and explicit retry", async () => {
    confirmed = receipt();
    mocks.markSubmitted.mockRejectedValue(new Error("Service unavailable"));
    const view = mount();
    await broadcast(view);
    expect(view.result.current.status).toBe("failed");
    expect(view.result.current.error).toBe("Service unavailable");
    expect(readPendingSubmission(key)).toEqual(pending);
    view.unmount();
    const reopened = mount();
    await act(async () => {});
    expect(mocks.markSubmitted).toHaveBeenCalledTimes(2);
    mocks.markSubmitted.mockResolvedValue(undefined);
    await act(async () => reopened.result.current.retry());
    expect(reopened.result.current.status).toBe("recorded");
    expect(readPendingSubmission(key)).toBeNull();
  });

  it.each(["another draft", "another subject"])(
    "isolates recovery from %s",
    async (scope) => {
      savePendingSubmission(key, pending);
      confirmed = receipt();
      const view = renderHook(() =>
        useDraftSubmissionRecording(
          { ...published, id: scope === "another draft" ? "d2" : draft.id },
          scope === "another subject"
            ? "0x5555555555555555555555555555555555555555"
            : draft.author
        )
      );
      await act(async () => {});
      expect(view.result.current.status).toBeNull();
      expect(mocks.markSubmitted).not.toHaveBeenCalled();
      expect(readPendingSubmission(key)).toEqual(pending);
    }
  );

  it.each(["missing", "different", "reverted"])(
    "clears recovery after %s without marking the draft",
    async (kind) => {
      savePendingSubmission(key, pending);
      if (kind === "missing") confirmed = { ...receipt(), logs: [] };
      else if (kind === "different")
        confirmed = receipt({ eventProposalId: "42" });
      else confirmed = receipt({ status: "reverted" });
      const view = mount();
      await act(async () => {});
      expect(mocks.markSubmitted).not.toHaveBeenCalled();
      expect(readPendingSubmission(key)).toBeNull();
      expect(view.result.current.status).toBe(
        kind === "reverted" ? "receipt-error" : kind
      );
      expect(view.result.current.canRetry).toBe(false);
      if (kind === "reverted")
        expect(view.result.current.error).toContain("reverted");
    }
  );

  it("retains a hash through a receipt outage and verifies it after reopening", async () => {
    const view = mount();
    await broadcast(view);
    receiptError = new Error("RPC temporarily unavailable");
    await act(async () => view.rerender());
    expect(view.result.current.status).toBe("receipt-error");
    expect(readPendingSubmission(key)).toEqual(pending);
    expect(mocks.markSubmitted).not.toHaveBeenCalled();
    view.unmount();
    receiptError = null;
    confirmed = receipt();
    const reopened = mount();
    await act(async () => {});
    expect(mocks.markSubmitted).toHaveBeenCalledExactlyOnceWith(submission);
    expect(reopened.result.current.status).toBe("recorded");
    expect(readPendingSubmission(key)).toBeNull();
  });

  it("can retry receipt verification after an outage", async () => {
    const view = mount();
    await broadcast(view);
    receiptError = new Error("RPC temporarily unavailable");
    await act(async () => view.rerender());
    expect(view.result.current.canRetry).toBe(true);
    mocks.refetch.mockImplementation(async () => {
      receiptError = null;
      confirmed = receipt();
      view.rerender();
      return { data: confirmed, error: null };
    });
    await act(async () => view.result.current.retry());
    expect(mocks.refetch).toHaveBeenCalledOnce();
    expect(mocks.markSubmitted).toHaveBeenCalledExactlyOnceWith(submission);
    expect(view.result.current.status).toBe("recorded");
    expect(readPendingSubmission(key)).toBeNull();
  });
});
