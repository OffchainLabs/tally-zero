// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { useState, type ReactNode } from "react";
import {
  createClient,
  custom,
  type TransactionReceipt,
  type WaitForTransactionReceiptParameters,
} from "viem";
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

it("delivers transaction replacements to both the live form and the draft recorder with real wagmi queries", async () => {
  const replacement = `0x${"cd".repeat(32)}` as const;
  const replacementReceipt = { ...receipt(), transactionHash: replacement };
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
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
  const view = renderHook(
    () => {
      const recording = useDraftSubmissionRecording(
        { ...draft, shareSlug: "slug" },
        draft.author
      );
      const [formHash, setFormHash] = useState<`0x${string}`>();
      useWaitForTransactionReceipt({
        chainId: arbitrum.id,
        hash: formHash,
        onReplaced: ({ transactionReceipt }) =>
          setFormHash(transactionReceipt.transactionHash),
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
    await waitFor(() => expect(waiters).toHaveLength(2));
    await act(async () => {
      for (const { parameters, resolve } of waiters) {
        parameters.onReplaced?.({
          reason: "repriced",
          transactionReceipt: replacementReceipt,
        } as Parameters<
          NonNullable<WaitForTransactionReceiptParameters["onReplaced"]>
        >[0]);
        resolve(replacementReceipt);
      }
    });
    await waitFor(() =>
      expect(view.result.current.recording.status).toBe("recorded")
    );
    expect(view.result.current.formHash).toBe(replacement);
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
