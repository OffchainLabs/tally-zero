// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import type { TransactionReceipt } from "viem";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { draftSubmissionStorageKey } from "@/config/storage-keys";
import {
  draft,
  governor,
  receipt,
  txHash,
} from "@/lib/drafts/submission-fixtures";
import { subscribePendingSubmission } from "@/lib/drafts/submission-recovery";
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
const newerHash = `0x${"cd".repeat(32)}` as const;
it("observes only matching storage keys and unsubscribes", () => {
  const listener = vi.fn();
  const stop = subscribePendingSubmission(key, listener);
  window.dispatchEvent(new StorageEvent("storage", { key: "another-draft" }));
  expect(listener).not.toHaveBeenCalled();
  window.dispatchEvent(new StorageEvent("storage", { key }));
  expect(listener).toHaveBeenCalledTimes(1);
  stop();
  window.dispatchEvent(new StorageEvent("storage", { key }));
  expect(listener).toHaveBeenCalledTimes(1);
});

it("recovers cross-tab storage updates and ignores another account", async () => {
  const view = mount();
  window.localStorage.setItem(
    draftSubmissionStorageKey(
      draft.id,
      "0x5555555555555555555555555555555555555555"
    ),
    JSON.stringify({ transactionHash: newerHash, governorAddress: governor })
  );
  await act(async () =>
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: draftSubmissionStorageKey(
          draft.id,
          "0x5555555555555555555555555555555555555555"
        ),
      })
    )
  );
  expect(view.result.current.status).toBeNull();
  window.localStorage.setItem(
    key,
    JSON.stringify({ transactionHash: txHash, governorAddress: governor })
  );
  await act(async () =>
    window.dispatchEvent(new StorageEvent("storage", { key }))
  );
  expect(view.result.current.status).toBe("confirming");
  confirmed = receipt();
  await act(async () => view.rerender());
  expect(view.result.current.status).toBe("recorded");
});
