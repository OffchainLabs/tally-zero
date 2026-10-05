// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import type { TransactionReceipt } from "viem";
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
    useDraftSubmissionRecording({ ...draft, shareSlug: "slug" }, draft.author),
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

it("ignores an older retry error after a newer transaction is recorded", async () => {
  const view = mount();
  receiptError = new Error("Old RPC outage");
  await act(async () =>
    view.result.current.onProposalSubmitted({
      hash: txHash,
      governorAddress: governor,
    }),
  );
  let finish!: (result: { error: Error }) => void;
  mocks.refetch.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  let retry!: Promise<void>;
  act(() => {
    retry = view.result.current.retry();
  });
  receiptError = null;
  confirmed = { ...receipt(), transactionHash: newerHash };
  await act(async () =>
    view.result.current.onProposalSubmitted({
      hash: newerHash,
      governorAddress: governor,
    }),
  );
  expect(view.result.current.status).toBe("recorded");
  await act(async () => {
    finish({ error: new Error("Old RPC outage") });
    await retry;
  });
  expect(view.result.current.status).toBe("recorded");
});
afterEach(cleanup);

it("recovers a wallet broadcast received after the original draft was reopened", async () => {
  const original = mount();
  const detachedBroadcast = original.result.current.onProposalSubmitted;
  original.unmount();
  const reopened = mount();
  await act(async () =>
    detachedBroadcast({ hash: txHash, governorAddress: governor }),
  );
  expect(reopened.result.current.status).toBe("confirming");
  confirmed = receipt();
  await act(async () => reopened.rerender());
  expect(mocks.markSubmitted).toHaveBeenCalledExactlyOnceWith({
    transactionHash: txHash,
    governorAddress: governor,
    proposalId,
  });
  expect(readPendingSubmission(key)).toBeNull();
});
