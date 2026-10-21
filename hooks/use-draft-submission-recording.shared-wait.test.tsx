// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { useState, type ReactNode } from "react";
import { createClient, custom } from "viem";
import { arbitrum } from "viem/chains";
import { afterEach, expect, it, vi } from "vitest";
import {
  createConfig,
  useWaitForTransactionReceipt,
  WagmiProvider,
} from "wagmi";

import { ARBITRUM_CHAIN_ID } from "@/config/arbitrum-governance";
import { draft, governor, txHash } from "@/lib/drafts/submission-fixtures";

import { useDraftSubmissionRecording } from "./use-draft-submission-recording";

const mocks = vi.hoisted(() => ({ markSubmitted: vi.fn() }));
vi.mock("./use-drafts", () => ({
  useMarkSubmitted: () => ({ markSubmitted: mocks.markSubmitted }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// viem keys its receipt observer by hash and, with wagmi's zero timeout, a
// second concurrent wait leaves a listener behind that hangs every later wait
// on the hash. The form and the recorder must therefore share one wait.
it("surfaces a revert to the form and the recorder through wagmi's retries", async () => {
  const blockHash = `0x${"ef".repeat(32)}` as const;
  const from = `0x${"11".repeat(20)}` as const;
  const request = vi.fn(async ({ method }: { method: string }) => {
    switch (method) {
      case "eth_getTransactionReceipt":
        return {
          transactionHash: txHash,
          transactionIndex: "0x0",
          blockHash,
          blockNumber: "0x10",
          from,
          to: governor,
          cumulativeGasUsed: "0x5208",
          gasUsed: "0x5208",
          effectiveGasPrice: "0x1",
          contractAddress: null,
          logs: [],
          logsBloom: `0x${"00".repeat(256)}`,
          status: "0x0",
          type: "0x2",
        };
      case "eth_getTransactionByHash":
        return {
          hash: txHash,
          nonce: "0x1",
          blockHash,
          blockNumber: "0x10",
          transactionIndex: "0x0",
          from,
          to: governor,
          value: "0x0",
          gas: "0x5208",
          maxFeePerGas: "0x2",
          maxPriorityFeePerGas: "0x1",
          input: "0x",
          type: "0x2",
          chainId: "0xa4b1",
          accessList: [],
          v: "0x0",
          r: "0x1",
          s: "0x1",
        };
      case "eth_call":
        return "0x";
      default:
        throw new Error(`Unexpected RPC request ${method}`);
    }
  });
  const config = createConfig({
    chains: [arbitrum],
    storage: null,
    client: ({ chain }) =>
      createClient({ chain, transport: custom({ request }) }),
  });
  // One retry is enough: before the fix it joins the stale listener and hangs.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: 1, retryDelay: 0 } },
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
  const wrapper = ({ children }: { children: ReactNode }) => (
    <WagmiProvider config={config} reconnectOnMount={false}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
  const view = renderHook(
    () => {
      const [formHash, setFormHash] = useState<`0x${string}`>();
      const recorder = useDraftSubmissionRecording(
        { ...draft, shareSlug: "slug" },
        draft.author
      );
      const form = useWaitForTransactionReceipt({
        chainId: ARBITRUM_CHAIN_ID,
        hash: formHash,
      });
      return { recorder, form, setFormHash };
    },
    { wrapper }
  );
  try {
    act(() => {
      view.result.current.recorder.onProposalSubmitted({
        hash: txHash,
        governorAddress: governor,
      });
      view.result.current.setFormHash(txHash);
    });
    await waitFor(() => expect(view.result.current.form.error).toBeTruthy());
    await waitFor(() =>
      expect(view.result.current.recorder.status).toBe("receipt-error")
    );
    expect(view.result.current.recorder.canRetry).toBe(true);
    expect(
      request.mock.calls.filter(
        ([{ method }]) => method === "eth_getTransactionReceipt"
      )
    ).toHaveLength(2);
  } finally {
    view.unmount();
    queryClient.clear();
  }
});
