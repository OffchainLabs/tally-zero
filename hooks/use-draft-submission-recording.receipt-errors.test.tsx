// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { createClient, custom } from "viem";
import { arbitrum } from "viem/chains";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createConfig, WagmiProvider } from "wagmi";

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

const mocks = vi.hoisted(() => ({ markSubmitted: vi.fn() }));
vi.mock("./use-drafts", () => ({
  useMarkSubmitted: () => ({ markSubmitted: mocks.markSubmitted }),
}));

const key = draftSubmissionStorageKey(draft.id, draft.author);
const pending = { transactionHash: txHash, governorAddress: governor };

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
  mocks.markSubmitted.mockResolvedValue(undefined);
});
afterEach(cleanup);

function mount() {
  const wait = vi.fn();
  const getReceipt = vi.fn();
  const replay = vi.fn(async () => {
    throw new Error("execution reverted");
  });
  const config = createConfig({
    chains: [arbitrum],
    storage: null,
    client: ({ chain }) =>
      createClient({
        chain,
        transport: custom({
          request: async () => {
            throw new Error("Unexpected RPC request");
          },
        }),
      }).extend(() => ({
        waitForTransactionReceipt: wait,
        getTransactionReceipt: getReceipt,
        getTransaction: vi.fn().mockResolvedValue({
          from: draft.author,
          input: "0x",
          type: "eip1559",
        }),
        call: replay,
      })),
  });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <WagmiProvider config={config} reconnectOnMount={false}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
  return {
    wait,
    getReceipt,
    replay,
    open: () =>
      renderHook(
        () =>
          useDraftSubmissionRecording(
            { ...draft, shareSlug: "slug" },
            draft.author
          ),
        { wrapper }
      ),
    queryClient,
  };
}

it("clears a verified revert even though real wagmi exposes it as an error", async () => {
  const harness = mount();
  harness.wait.mockResolvedValue(receipt({ status: "reverted" }));
  harness.getReceipt.mockResolvedValue(receipt({ status: "reverted" }));
  savePendingSubmission(key, pending);
  const view = harness.open();
  try {
    await waitFor(() =>
      expect(view.result.current.error).toContain("reverted")
    );
    await waitFor(() => expect(readPendingSubmission(key)).toBeNull());
    expect(harness.replay).toHaveBeenCalledOnce();
    expect(harness.getReceipt).toHaveBeenCalledWith({ hash: txHash });
    expect(view.result.current.status).toBe("receipt-error");
    expect(view.result.current.canRetry).toBe(false);
    expect(mocks.markSubmitted).not.toHaveBeenCalled();
    view.unmount();
    const reopened = harness.open();
    expect(reopened.result.current.status).toBeNull();
    expect(reopened.result.current.canRetry).toBe(false);
    reopened.unmount();
  } finally {
    view.unmount();
    harness.queryClient.clear();
  }
});

it("does not clear a newer submission when an older raw receipt arrives late", async () => {
  const harness = mount();
  const newerHash = `0x${"cd".repeat(32)}` as const;
  harness.wait
    .mockResolvedValueOnce(receipt({ status: "reverted" }))
    .mockImplementation(() => new Promise(() => {}));
  let finishReceipt!: (value: ReturnType<typeof receipt>) => void;
  harness.getReceipt.mockImplementation(
    () =>
      new Promise((resolve) => {
        finishReceipt = resolve;
      })
  );
  savePendingSubmission(key, pending);
  const view = harness.open();
  try {
    await waitFor(() => expect(harness.getReceipt).toHaveBeenCalledOnce());
    act(() =>
      view.result.current.onProposalSubmitted({
        hash: newerHash,
        governorAddress: governor,
      })
    );
    await waitFor(() => expect(harness.wait).toHaveBeenCalledTimes(2));
    await act(async () => finishReceipt(receipt({ status: "reverted" })));
    expect(readPendingSubmission(key)).toEqual({
      ...pending,
      transactionHash: newerHash,
    });
    expect(view.result.current.status).toBe("confirming");
    expect(mocks.markSubmitted).not.toHaveBeenCalled();
  } finally {
    view.unmount();
    harness.queryClient.clear();
  }
});

it("preserves recovery through an RPC outage and records after verification succeeds", async () => {
  const harness = mount();
  // Error wording alone must never be used as proof of a revert.
  const outage = new Error("execution reverted: RPC temporarily unavailable");
  harness.wait.mockRejectedValue(outage);
  harness.getReceipt.mockRejectedValue(outage);
  savePendingSubmission(key, pending);
  const view = harness.open();
  try {
    await waitFor(() => expect(view.result.current.canRetry).toBe(true));
    await waitFor(() => expect(harness.getReceipt).toHaveBeenCalledOnce());
    expect(readPendingSubmission(key)).toEqual(pending);
    expect(mocks.markSubmitted).not.toHaveBeenCalled();
    harness.getReceipt.mockResolvedValue(receipt());
    await act(async () => view.result.current.retry());
    await waitFor(() => expect(view.result.current.status).toBe("recorded"));
    expect(mocks.markSubmitted).toHaveBeenCalledExactlyOnceWith({
      ...pending,
      proposalId,
    });
    expect(readPendingSubmission(key)).toBeNull();
    expect(view.result.current.canRetry).toBe(false);
  } finally {
    view.unmount();
    harness.queryClient.clear();
  }
});

it("clears recovery when a retry verifies a revert after the raw receipt was unavailable", async () => {
  const harness = mount();
  harness.wait.mockResolvedValue(receipt({ status: "reverted" }));
  harness.getReceipt.mockRejectedValue(new Error("RPC unavailable"));
  savePendingSubmission(key, pending);
  const view = harness.open();
  try {
    await waitFor(() => expect(view.result.current.canRetry).toBe(true));
    await waitFor(() => expect(harness.getReceipt).toHaveBeenCalledOnce());
    expect(readPendingSubmission(key)).toEqual(pending);
    harness.getReceipt.mockResolvedValue(receipt({ status: "reverted" }));
    await act(async () => view.result.current.retry());
    await waitFor(() => expect(readPendingSubmission(key)).toBeNull());
    expect(view.result.current.canRetry).toBe(false);
    expect(view.result.current.error).toContain("reverted");
    expect(mocks.markSubmitted).not.toHaveBeenCalled();
  } finally {
    view.unmount();
    harness.queryClient.clear();
  }
});
