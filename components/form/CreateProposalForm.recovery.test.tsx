// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  waitFor,
} from "@testing-library/react";
import { createClient, custom } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arbitrum } from "viem/chains";
import { afterEach, expect, it, vi } from "vitest";
import { createConfig, WagmiProvider } from "wagmi";

import { draftSubmissionStorageKey } from "@/config/storage-keys";
import {
  useDraftSubmissionRecording,
  type RecordableDraft,
} from "@/hooks/use-draft-submission-recording";
import { draftToFormState } from "@/lib/drafts/mapping";
import {
  draft,
  governor,
  proposalId,
  receipt,
  txHash,
} from "@/lib/drafts/submission-fixtures";
import { readPendingSubmission } from "@/lib/drafts/submission-recovery";
import CreateProposalForm from "./CreateProposalForm";

const mocks = vi.hoisted(() => ({ markSubmitted: vi.fn(), simulate: vi.fn() }));
// Keep the real wagmi mutation observer; per-call callbacks disappear on unmount.
vi.mock("wagmi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("wagmi")>()),
  useAccount: () => ({
    address: "0x1111111111111111111111111111111111111111",
    isConnected: true,
  }),
  useReadContract: ({ functionName }: { functionName: string }) => ({
    data: functionName === "proposalThreshold" ? BigInt(0) : BigInt(100),
    isLoading: false,
  }),
  useSimulateContract: mocks.simulate,
  useWaitForTransactionReceipt: ({ hash }: { hash?: string }) => ({
    data: hash ? receipt() : undefined,
    isSuccess: !!hash,
    isLoading: false,
    error: null,
  }),
}));
vi.mock("@/hooks/use-drafts", () => ({
  useMarkSubmitted: () => ({ markSubmitted: mocks.markSubmitted }),
}));
vi.mock("@/hooks/use-governance-clock", () => ({
  useGovernanceClock: () => ({
    clockBlock: BigInt(23456789),
    isLoading: false,
  }),
}));
vi.mock("next-themes", () => ({ useTheme: () => ({ resolvedTheme: "dark" }) }));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
}));

function RecordedForm({ opened }: { opened: RecordableDraft }) {
  const { onProposalSubmitted } = useDraftSubmissionRecording(
    opened,
    opened.author
  );
  return (
    <CreateProposalForm
      initialDraft={draftToFormState(opened)}
      draftId={opened.id}
      onProposalSubmitted={onProposalSubmitted}
    />
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("persists for the original draft after navigation before the wallet returns its hash, then recovers on reopening", async () => {
  const entries = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => entries.set(key, value),
      removeItem: (key: string) => entries.delete(key),
    },
  });
  let finish!: (hash: `0x${string}`) => void;
  const write = vi.fn(
    () =>
      new Promise<`0x${string}`>((resolve) => {
        finish = resolve;
      })
  );
  const account = privateKeyToAccount(`0x${"01".repeat(32)}`);
  const config = createConfig({
    chains: [arbitrum],
    storage: null,
    client: ({ chain }) =>
      createClient({
        chain,
        transport: custom({
          request: async () => {
            throw new Error("Unexpected network request");
          },
        }),
      }).extend(() => ({ writeContract: write })),
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  mocks.simulate.mockReturnValue({
    data: { request: { account, chainId: arbitrum.id } },
    isFetching: false,
    isError: false,
    error: null,
  });
  mocks.markSubmitted.mockResolvedValue(undefined);
  const published = { ...draft, shareSlug: "slug" };
  const otherDraft = {
    ...published,
    id: "another-draft",
    author: "0x5555555555555555555555555555555555555555",
  };
  const content = (opened: RecordableDraft) => (
    <WagmiProvider config={config} reconnectOnMount={false}>
      <QueryClientProvider client={client}>
        <RecordedForm key={`${opened.id}:${opened.author}`} opened={opened} />
      </QueryClientProvider>
    </WagmiProvider>
  );
  const view = render(content(published));
  try {
    fireEvent.click(view.getByRole("button", { name: "Submit Proposal" }));
    await waitFor(() => expect(write).toHaveBeenCalledOnce());
    view.rerender(content(otherDraft));
    await act(async () => finish(txHash));
    await waitFor(() =>
      expect(client.getMutationCache().getAll()[0].state.status).toBe("success")
    );
    expect(
      readPendingSubmission(draftSubmissionStorageKey(draft.id, draft.author))
    ).toEqual({ transactionHash: txHash, governorAddress: governor });
    expect(
      readPendingSubmission(
        draftSubmissionStorageKey(otherDraft.id, otherDraft.author)
      )
    ).toBeNull();
    expect(mocks.markSubmitted).not.toHaveBeenCalled();
    view.rerender(content(published));
    await waitFor(() =>
      expect(mocks.markSubmitted).toHaveBeenCalledExactlyOnceWith({
        transactionHash: txHash,
        governorAddress: governor,
        proposalId,
      })
    );
    expect(
      readPendingSubmission(draftSubmissionStorageKey(draft.id, draft.author))
    ).toBeNull();
  } finally {
    view.unmount();
    client.clear();
  }
});
