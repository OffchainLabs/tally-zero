// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import {
  createClient,
  custom,
  type TransactionReceipt,
  type WaitForTransactionReceiptParameters,
} from "viem";
import { arbitrum } from "viem/chains";
import { afterEach, expect, it, vi } from "vitest";
import { createConfig, WagmiProvider } from "wagmi";

import {
  draft,
  governor,
  receipt,
  txHash,
} from "@/lib/drafts/submission-fixtures";

import { useDraftSubmissionRecording } from "./use-draft-submission-recording";

const mocks = vi.hoisted(() => ({ markSubmitted: vi.fn() }));
vi.mock("./use-drafts", () => ({
  useMarkSubmitted: () => ({ markSubmitted: mocks.markSubmitted }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it.each(["repriced", "cancelled"] as const)(
  "handles %s after reopening with original wait query still in flight",
  async (reason) => {
    const replacement = `0x${"cd".repeat(32)}` as const;
    const replacementReceipt = {
      ...receipt(),
      transactionHash: replacement,
      ...(reason === "cancelled" ? { logs: [] } : {}),
    };
    const waiters: {
      parameters: WaitForTransactionReceiptParameters;
      resolve: (receipt: TransactionReceipt) => void;
    }[] = [];
    const wait = vi.fn((parameters: WaitForTransactionReceiptParameters) => {
      if (parameters.hash === replacement)
        return Promise.resolve(replacementReceipt);
      return new Promise<TransactionReceipt>((resolve) =>
        waiters.push({ parameters, resolve })
      );
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
        }).extend(() => ({ waitForTransactionReceipt: wait })),
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
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      </WagmiProvider>
    );
    const mount = () =>
      renderHook(
        () =>
          useDraftSubmissionRecording(
            { ...draft, shareSlug: "slug" },
            draft.author
          ),
        { wrapper }
      );
    const original = mount();
    act(() =>
      original.result.current.onProposalSubmitted({
        hash: txHash,
        governorAddress: governor,
      })
    );
    await waitFor(() => expect(waiters).toHaveLength(1));
    original.unmount();
    const reopened = mount();
    await waitFor(() => expect(waiters).toHaveLength(2));
    await act(async () => {
      for (const { parameters, resolve } of waiters) {
        parameters.onReplaced?.({
          reason,
          transactionReceipt: replacementReceipt,
        } as Parameters<
          NonNullable<WaitForTransactionReceiptParameters["onReplaced"]>
        >[0]);
        resolve(replacementReceipt);
      }
    });
    try {
      await waitFor(() =>
        expect(reopened.result.current.status).toBe(
          reason === "cancelled" ? "receipt-error" : "recorded"
        )
      );
    } finally {
      reopened.unmount();
      queryClient.clear();
    }
  }
);
