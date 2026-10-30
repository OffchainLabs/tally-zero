// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createClient, custom } from "viem";
import { arbitrum } from "viem/chains";
import { afterEach, expect, it, vi } from "vitest";
import {
  createConfig,
  useWaitForTransactionReceipt,
  WagmiProvider,
} from "wagmi";

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

const mocks = vi.hoisted(() => ({ markSubmitted: vi.fn() }));
vi.mock("./use-drafts", () => ({
  useMarkSubmitted: () => ({ markSubmitted: mocks.markSubmitted }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const replacement = `0x${"cd".repeat(32)}` as const;
const blockHash = `0x${"ef".repeat(32)}` as const;
const blockNumber = "0x10";
const from = draft.author as `0x${string}`;

// The original is still pending; the replacement took its nonce and was mined
// with the same call, which viem classifies as "repriced".
function rpcTransaction(hash: `0x${string}`) {
  const mined = hash === replacement;
  return {
    hash,
    nonce: "0x1",
    blockHash: mined ? blockHash : null,
    blockNumber: mined ? blockNumber : null,
    transactionIndex: mined ? "0x0" : null,
    from,
    to: governor,
    value: "0x0",
    gas: "0x5208",
    maxFeePerGas: mined ? "0x4" : "0x2",
    maxPriorityFeePerGas: "0x1",
    input: "0x1234",
    type: "0x2",
    chainId: "0xa4b1",
    accessList: [],
    v: "0x0",
    r: "0x1",
    s: "0x1",
  };
}

function rpcReceipt() {
  return {
    transactionHash: replacement,
    transactionIndex: "0x0",
    blockHash,
    blockNumber,
    from,
    to: governor,
    cumulativeGasUsed: "0x5208",
    gasUsed: "0x5208",
    effectiveGasPrice: "0x1",
    contractAddress: null,
    logs: receipt().logs.map((log, index) => ({
      ...log,
      blockHash,
      blockNumber,
      logIndex: `0x${index.toString(16)}`,
      transactionHash: replacement,
      transactionIndex: "0x0",
      removed: false,
    })),
    logsBloom: `0x${"00".repeat(256)}`,
    status: "0x1",
    type: "0x2",
  };
}

// viem keys its receipt observer by hash, and with wagmi's zero timeout a
// second concurrent wait leaves a listener behind that hangs every later wait
// on the hash. The form and the recorder must therefore share one wait, and
// the form, as the child, starts the fetch, so its onReplaced fires and
// forwards the event. The RPC outage after the replacement makes the recorder
// wait on the replacement hash a second time through retry(), which hangs on
// the stale listener while two waits exist.
it("delivers a transaction replacement to the form and the recorder through viem's shared observer and keeps the replacement retryable", async () => {
  let replacementReceiptReads = 0;
  let rpcDown = true;
  const request = vi.fn(
    async ({ method, params }: { method: string; params?: unknown[] }) => {
      const [hash] = (params ?? []) as [`0x${string}`];
      switch (method) {
        case "eth_blockNumber":
          return blockNumber;
        case "eth_getTransactionByHash":
          return rpcTransaction(hash);
        case "eth_getBlockByNumber":
          return {
            number: blockNumber,
            hash: blockHash,
            parentHash: `0x${"00".repeat(32)}`,
            timestamp: "0x1",
            gasLimit: "0x1",
            gasUsed: "0x5208",
            baseFeePerGas: "0x1",
            difficulty: "0x0",
            totalDifficulty: "0x0",
            size: "0x1",
            transactions: [rpcTransaction(replacement)],
          };
        case "eth_getTransactionReceipt":
          if (hash !== replacement) return null;
          // Served once for viem's replacement detection, then unavailable
          // until the test brings the RPC back.
          replacementReceiptReads += 1;
          if (rpcDown && replacementReceiptReads > 1)
            throw new Error("RPC unavailable");
          return rpcReceipt();
        default:
          throw new Error(`Unexpected RPC request ${method}`);
      }
    }
  );
  const config = createConfig({
    chains: [arbitrum],
    storage: null,
    client: ({ chain }) =>
      createClient({
        chain,
        transport: custom({ request }, { retryCount: 0 }),
      }),
  });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
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
  const wrapper = ({ children }: { children: ReactNode }) => (
    <WagmiProvider config={config} reconnectOnMount={false}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
  const view = renderHook(
    () => {
      const [formHash, setFormHash] = useState<`0x${string}`>();
      const recorder =
        useRef<ReturnType<typeof useDraftSubmissionRecording>>(null);
      useWaitForTransactionReceipt({
        chainId: arbitrum.id,
        hash: formHash,
        onReplaced: (replacement) => {
          recorder.current?.onProposalReplaced(replacement);
          setFormHash(replacement.transactionReceipt.transactionHash);
        },
      });
      const recording = useDraftSubmissionRecording(
        { ...draft, shareSlug: "slug" },
        draft.author
      );
      useEffect(() => {
        recorder.current = recording;
      });
      return { recording, formHash, setFormHash };
    },
    { wrapper }
  );
  try {
    act(() => {
      view.result.current.recording.onProposalSubmitted({
        hash: txHash,
        governorAddress: governor,
      });
      view.result.current.setFormHash(txHash);
    });
    await waitFor(() => expect(view.result.current.formHash).toBe(replacement));
    // viem found the replacement in the block, so the event came from its
    // observer, not from the test.
    expect(
      request.mock.calls.filter(
        ([{ method }]) => method === "eth_getBlockByNumber"
      )
    ).toHaveLength(1);
    expect(
      readPendingSubmission(draftSubmissionStorageKey(draft.id, draft.author))
    ).toMatchObject({
      transactionHash: replacement,
      governorAddress: governor,
    });
    await waitFor(() =>
      expect(view.result.current.recording.status).toBe("receipt-error")
    );
    expect(view.result.current.recording.canRetry).toBe(true);
    rpcDown = false;
    await act(async () => view.result.current.recording.retry());
    await waitFor(() =>
      expect(view.result.current.recording.status).toBe("recorded")
    );
    expect(mocks.markSubmitted).toHaveBeenCalledExactlyOnceWith({
      transactionHash: replacement,
      governorAddress: governor,
      proposalId,
    });
    expect(
      readPendingSubmission(draftSubmissionStorageKey(draft.id, draft.author))
    ).toBeNull();
  } finally {
    view.unmount();
    queryClient.clear();
  }
});
