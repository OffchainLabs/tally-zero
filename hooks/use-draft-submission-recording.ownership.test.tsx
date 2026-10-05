// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import type {
  TransactionReceipt,
  WaitForTransactionReceiptParameters,
} from "viem";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { draftSubmissionStorageKey } from "@/config/storage-keys";
import {
  draft,
  governor,
  receipt,
  txHash,
} from "@/lib/drafts/submission-fixtures";
import { readPendingSubmission } from "@/lib/drafts/submission-recovery";
import { useDraftSubmissionRecording } from "./use-draft-submission-recording";

const mocks = vi.hoisted(() => ({
  wait: vi.fn(),
  markSubmitted: vi.fn(),
  refetch: vi.fn(),
}));
vi.mock("./use-drafts", () => ({
  useMarkSubmitted: () => ({ markSubmitted: mocks.markSubmitted }),
}));
vi.mock("wagmi", () => ({
  useWaitForTransactionReceipt: mocks.wait,
  useTransactionReceipt: () => ({ refetch: vi.fn() }),
}));
let confirmed: TransactionReceipt | undefined;
let receiptError: Error | null;
const key = draftSubmissionStorageKey(draft.id, draft.author);
const newerHash = `0x${"cd".repeat(32)}` as const;
const mount = () =>
  renderHook(() =>
    useDraftSubmissionRecording({ ...draft, shareSlug: "slug" }, draft.author)
  );

beforeEach(() => {
  vi.clearAllMocks();
  confirmed = undefined;
  receiptError = null;
  const entries = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => entries.set(key, value),
      removeItem: (key: string) => entries.delete(key),
    },
  });
  mocks.markSubmitted.mockResolvedValue(undefined);
  mocks.wait.mockImplementation(({ hash }: { hash?: string }) => ({
    data: hash ? confirmed : undefined,
    error: hash ? receiptError : null,
    refetch: mocks.refetch,
  }));
});

afterEach(cleanup);
it.each(["repriced", "replaced"] as const)(
  "preserves newer recovery after a detached old %s callback",
  async (reason) => {
    const original = mount();
    await act(async () =>
      original.result.current.onProposalSubmitted({
        hash: txHash,
        governorAddress: governor,
      })
    );
    const oldWait = mocks.wait.mock.calls.find(
      ([parameters]) => parameters.hash === txHash
    )?.[0] as WaitForTransactionReceiptParameters;
    original.unmount();
    const reopened = mount();
    await act(async () =>
      reopened.result.current.onProposalSubmitted({
        hash: newerHash,
        governorAddress: governor,
      })
    );
    const oldReplacement = `0x${"ef".repeat(32)}` as const;
    await act(async () =>
      oldWait.onReplaced?.({
        reason,
        transactionReceipt: { ...receipt(), transactionHash: oldReplacement },
      } as Parameters<
        NonNullable<WaitForTransactionReceiptParameters["onReplaced"]>
      >[0])
    );
    expect(readPendingSubmission(key)?.transactionHash).toBe(newerHash);
  }
);

it.each(["repriced", "replaced"] as const)(
  "preserves a newer cross-tab write before its event reaches the active %s callback",
  async (reason) => {
    const view = mount();
    await act(async () =>
      view.result.current.onProposalSubmitted({
        hash: txHash,
        governorAddress: governor,
      })
    );
    const oldWait = mocks.wait.mock.calls.find(
      ([parameters]) => parameters.hash === txHash
    )?.[0] as WaitForTransactionReceiptParameters;
    // Browser localStorage is shared synchronously; the receiving tab gets the storage event later.
    window.localStorage.setItem(
      key,
      JSON.stringify({ transactionHash: newerHash, governorAddress: governor })
    );
    const oldReplacement = `0x${"ef".repeat(32)}` as const;
    await act(async () =>
      oldWait.onReplaced?.({
        reason,
        transactionReceipt: { ...receipt(), transactionHash: oldReplacement },
      } as Parameters<
        NonNullable<WaitForTransactionReceiptParameters["onReplaced"]>
      >[0])
    );
    expect(readPendingSubmission(key)?.transactionHash).toBe(newerHash);
    await act(async () =>
      window.dispatchEvent(new StorageEvent("storage", { key }))
    );
    expect(mocks.wait).toHaveBeenLastCalledWith(
      expect.objectContaining({ hash: newerHash })
    );
  }
);
