// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { encodeAbiParameters, encodeEventTopics, parseAbiItem } from "viem";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GOVERNORS } from "@/config/governors";
import { draftSubmissionStorageKey } from "@/config/storage-keys";

import { ProposalDraftLoader } from "@/components/drafts/ProposalDraftLoader";
import { computeProposalId, normalizeActions } from "@/lib/propose-utils";
import type { Draft } from "@/lib/siwe/types";

import CreateProposalForm from "./CreateProposalForm";

const mocks = vi.hoisted(() => ({
  searchParams: new URLSearchParams(),
  pathname: "/proposal/new",
  replace: vi.fn(),
  useSiwe: vi.fn(),
  useDraft: vi.fn(),
  createDraft: vi.fn(),
  patchDraft: vi.fn(),
  markSubmitted: vi.fn(),
  useAccount: vi.fn(),
  useGovernanceClock: vi.fn(),
  useReadContract: vi.fn(),
  useSimulateContract: vi.fn(),
  useWaitForTransactionReceipt: vi.fn(),
  useWriteContract: vi.fn(),
  toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => mocks.searchParams,
  usePathname: () => mocks.pathname,
  useRouter: () => ({ replace: mocks.replace }),
}));
vi.mock("@/hooks/use-siwe", () => ({ useSiwe: mocks.useSiwe }));
vi.mock("@/hooks/use-drafts", () => ({
  useDraft: mocks.useDraft,
  useMarkSubmitted: () => ({ markSubmitted: mocks.markSubmitted }),
  useDraftMutations: () => ({
    createDraft: mocks.createDraft,
    patchDraft: mocks.patchDraft,
    isCreating: false,
    isPatching: false,
  }),
}));

vi.mock("sonner", () => ({ toast: mocks.toast }));

vi.mock("next-themes", () => ({ useTheme: () => ({ resolvedTheme: "dark" }) }));

vi.mock("next/dynamic", () => ({
  default: () =>
    function MDEditorStub() {
      return null;
    },
}));

vi.mock("wagmi", () => ({
  useAccount: mocks.useAccount,
  useReadContract: mocks.useReadContract,
  useSimulateContract: mocks.useSimulateContract,
  useWaitForTransactionReceipt: mocks.useWaitForTransactionReceipt,
  useWriteContract: mocks.useWriteContract,
}));

vi.mock("@/hooks/use-governance-clock", () => ({
  useGovernanceClock: mocks.useGovernanceClock,
}));

// Node ships its own experimental `localStorage` global, which stays undefined
// without `--localstorage-file` and shadows jsdom's. An in-memory Storage is
// all the form needs.
function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key) => map.get(key) ?? null,
    key: (index) => [...map.keys()][index] ?? null,
    removeItem: (key) => {
      map.delete(key);
    },
    setItem: (key, value) => {
      map.set(key, String(value));
    },
  };
}

function installStorage() {
  const storage = memoryStorage();
  vi.stubGlobal("localStorage", storage);
  if (window !== globalThis) {
    Object.defineProperty(window, "localStorage", {
      value: storage,
      configurable: true,
    });
  }
}

const ACCOUNT = "0x1234567890abcdef1234567890abcdef12345678";
const STORED_TARGET = "0x2222222222222222222222222222222222222222";

// A draft stored on the server on New Year's Day; every local copy in these
// tests is dated relative to it.
const SERVER_UPDATED_AT = "2026-01-01T00:00:00Z";

const stored = {
  title: "Stored draft",
  description: "# Stored\n\nbody",
  governorType: "core" as const,
  actions: [
    { id: "restored-0", target: STORED_TARGET, value: "5", calldata: "0x" },
  ],
  updatedAt: SERVER_UPDATED_AT,
};

const serverDraft: Draft = {
  id: "d1",
  author: ACCOUNT,
  title: stored.title,
  description: stored.description,
  governorType: "CONSTITUTIONAL",
  actions: [{ target: STORED_TARGET, value: "5", calldata: "0x" }],
  status: "draft",
  shareSlug: null,
  onchain: null,
  createdAt: SERVER_UPDATED_AT,
  updatedAt: SERVER_UPDATED_AT,
};

const published: Draft = {
  ...serverDraft,
  status: "published",
  shareSlug: "shared",
};
const RECOVERY_KEY = draftSubmissionStorageKey(published.id, ACCOUNT);
const OTHER_ACCOUNT = "0x5555555555555555555555555555555555555555";

function setupSubmission() {
  const event = parseAbiItem(
    "event ProposalCreated(uint256 proposalId, address proposer, address[] targets, uint256[] values, string[] signatures, bytes[] calldatas, uint256 startBlock, uint256 endBlock, string description)"
  );
  const { targets, values, calldatas } = normalizeActions(serverDraft.actions);
  const proposalId = computeProposalId(
    targets,
    values,
    calldatas,
    serverDraft.description
  );
  const transactionHash = `0x${"ab".repeat(32)}` as `0x${string}`;
  const receipt = {
    status: "success",
    transactionHash,
    logs: [
      {
        address: GOVERNORS.core.address,
        topics: encodeEventTopics({
          abi: [event],
          eventName: "ProposalCreated",
        }),
        data: encodeAbiParameters(
          [
            { type: "uint256" },
            { type: "address" },
            { type: "address[]" },
            { type: "uint256[]" },
            { type: "string[]" },
            { type: "bytes[]" },
            { type: "uint256" },
            { type: "uint256" },
            { type: "string" },
          ],
          [
            BigInt(proposalId),
            ACCOUNT as `0x${string}`,
            targets,
            values,
            [],
            calldatas,
            BigInt(1),
            BigInt(2),
            serverDraft.description,
          ]
        ),
      },
    ],
  };

  mocks.useReadContract.mockImplementation(
    (options: { functionName?: string }) => ({
      data:
        options.functionName === "proposalThreshold" ? BigInt(0) : BigInt(100),
      isLoading: false,
    })
  );
  mocks.useSimulateContract.mockReturnValue({
    data: { request: {} },
    error: null,
    isError: false,
    isFetching: false,
  });
  const writeContract = vi.fn(
    (
      _request: unknown,
      callbacks: { onSuccess: (hash: `0x${string}`) => void }
    ) => callbacks.onSuccess(transactionHash)
  );
  mocks.useWriteContract.mockReturnValue({
    error: null,
    isPending: false,
    writeContract,
  });
  const state = { confirmed: true, receipt };
  mocks.useWaitForTransactionReceipt.mockImplementation(
    ({ hash }: { hash?: string }) => ({
      data: hash && state.confirmed ? state.receipt : undefined,
      isLoading: Boolean(hash) && !state.confirmed,
      isSuccess: Boolean(hash) && state.confirmed,
      error: null,
    })
  );

  return {
    state,
    transactionHash,
    proposalId,
    writeContract,
    submission: {
      transactionHash,
      governorAddress: GOVERNORS.core.address,
      proposalId,
    },
  };
}

async function submit(view: ReturnType<typeof render>) {
  await act(async () => {
    fireEvent.click(view.getByRole("button", { name: "Submit Proposal" }));
  });
}

function storedSubmission() {
  const value = window.localStorage.getItem(RECOVERY_KEY);
  return value ? JSON.parse(value) : null;
}

describe("published draft submission recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    installStorage();
    mocks.searchParams = new URLSearchParams("draft=d1");
    mocks.pathname = "/proposal/new";
    mocks.useSiwe.mockReturnValue({
      isSignedIn: true,
      isLoadingSession: false,
      effectiveAddress: ACCOUNT,
    });
    mocks.markSubmitted.mockResolvedValue(undefined);
    mocks.useDraft.mockReturnValue({
      data: published,
      isLoading: false,
      error: null,
    });

    mocks.useGovernanceClock.mockReturnValue({
      clockBlock: BigInt(23_456_789),
      isLoading: false,
    });
    mocks.useAccount.mockReturnValue({
      address: "0x1111111111111111111111111111111111111111",
      isConnected: true,
    });
    mocks.useReadContract.mockReturnValue({
      data: undefined,
      isLoading: false,
    });
    mocks.useSimulateContract.mockReturnValue({
      data: undefined,
      error: null,
      isError: false,
      isFetching: false,
    });
    mocks.useWriteContract.mockReturnValue({
      error: null,
      isPending: false,
      writeContract: vi.fn(),
    });
    mocks.useWaitForTransactionReceipt.mockReturnValue({
      isLoading: false,
      isSuccess: false,
      error: null,
    });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("records once after disconnecting during confirmation and reconnecting", async () => {
    const { state, submission } = setupSubmission();
    state.confirmed = false;
    const view = render(<ProposalDraftLoader />);
    await submit(view);
    mocks.useAccount.mockReturnValue({
      address: undefined,
      isConnected: false,
    });
    mocks.useSiwe.mockReturnValue({
      isSignedIn: false,
      isLoadingSession: false,
      effectiveAddress: null,
    });
    mocks.useDraft.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
    });
    view.rerender(<ProposalDraftLoader />);
    state.confirmed = true;
    await act(async () => {
      view.rerender(<ProposalDraftLoader />);
    });
    expect(mocks.markSubmitted).not.toHaveBeenCalled();
    expect(storedSubmission()).toEqual(submission);
    mocks.useAccount.mockReturnValue({ address: ACCOUNT, isConnected: true });
    mocks.useSiwe.mockReturnValue({
      isSignedIn: true,
      isLoadingSession: false,
      effectiveAddress: ACCOUNT,
    });
    mocks.useDraft.mockReturnValue({
      data: published,
      isLoading: false,
      error: null,
    });
    await act(async () => {
      view.rerender(<ProposalDraftLoader />);
    });
    expect(mocks.markSubmitted).toHaveBeenCalledExactlyOnceWith(submission);
    expect(storedSubmission()).toBeNull();
    await act(async () => {
      view.rerender(<ProposalDraftLoader />);
    });
    expect(mocks.markSubmitted).toHaveBeenCalledOnce();
    expect(storedSubmission()).toBeNull();
  });

  it("restores a failed recording after reopening and clears recovery only after success", async () => {
    const { submission, writeContract } = setupSubmission();
    mocks.markSubmitted.mockRejectedValue(new Error("Service unavailable"));
    const view = render(<ProposalDraftLoader />);
    await submit(view);
    expect(
      view.getByRole("button", { name: "Retry recording submission" })
    ).toBeDefined();
    expect(storedSubmission()).toEqual(submission);
    view.unmount();
    const reopened = render(<ProposalDraftLoader />);
    await act(async () => {});
    expect(mocks.markSubmitted).toHaveBeenCalledTimes(2);
    expect(
      reopened.getByRole("button", { name: "Retry recording submission" })
    ).toBeDefined();
    expect(storedSubmission()).toEqual(submission);
    mocks.markSubmitted.mockResolvedValue(undefined);
    await act(async () => {
      fireEvent.click(
        reopened.getByRole("button", { name: "Retry recording submission" })
      );
    });
    expect(mocks.markSubmitted).toHaveBeenLastCalledWith(submission);
    expect(reopened.container.textContent).toContain(
      "This draft is now marked submitted"
    );
    expect(storedSubmission()).toBeNull();
    expect(writeContract).toHaveBeenCalledOnce();
  });

  it("checks the receipt again before recording a stored submission", async () => {
    const { state, submission, transactionHash } = setupSubmission();
    state.confirmed = false;
    window.localStorage.setItem(RECOVERY_KEY, JSON.stringify(submission));
    const view = render(<ProposalDraftLoader />);
    expect(mocks.useWaitForTransactionReceipt).toHaveBeenLastCalledWith(
      expect.objectContaining({ hash: transactionHash })
    );
    expect(mocks.markSubmitted).not.toHaveBeenCalled();
    state.confirmed = true;
    await act(async () => {
      view.rerender(<ProposalDraftLoader />);
    });
    expect(mocks.markSubmitted).toHaveBeenCalledExactlyOnceWith(submission);
    expect(storedSubmission()).toBeNull();
  });

  it.each(["another subject", "another draft"])(
    "does not restore recovery for %s",
    async (scope) => {
      const { submission } = setupSubmission();
      window.localStorage.setItem(RECOVERY_KEY, JSON.stringify(submission));
      const record = vi.fn();
      render(
        <CreateProposalForm
          initialDraft={stored}
          onProposalConfirmed={record}
          draftSubmissionKey={draftSubmissionStorageKey(
            scope === "another draft" ? "d2" : published.id,
            scope === "another subject" ? OTHER_ACCOUNT : ACCOUNT
          )}
        />
      );
      await act(async () => {});
      expect(mocks.useWaitForTransactionReceipt).toHaveBeenLastCalledWith(
        expect.objectContaining({ hash: undefined })
      );
      expect(record).not.toHaveBeenCalled();
      expect(storedSubmission()).toEqual(submission);
    }
  );

  it("does not send an in-flight submission through another draft's recording callback", async () => {
    const { state, submission } = setupSubmission();
    state.confirmed = false;
    const firstRecord = vi.fn().mockResolvedValue("recorded");
    const otherRecord = vi.fn().mockResolvedValue("recorded");
    const view = render(
      <CreateProposalForm
        initialDraft={stored}
        onProposalConfirmed={firstRecord}
        draftSubmissionKey={RECOVERY_KEY}
      />
    );
    await submit(view);
    state.confirmed = true;
    await act(async () => {
      view.rerender(
        <CreateProposalForm
          initialDraft={stored}
          onProposalConfirmed={otherRecord}
          draftSubmissionKey={draftSubmissionStorageKey("d2", OTHER_ACCOUNT)}
        />
      );
    });
    expect(firstRecord).not.toHaveBeenCalled();
    expect(otherRecord).not.toHaveBeenCalled();
    expect(storedSubmission()).toEqual(submission);
    await act(async () => {
      view.rerender(
        <CreateProposalForm
          initialDraft={stored}
          onProposalConfirmed={firstRecord}
          draftSubmissionKey={RECOVERY_KEY}
        />
      );
    });
    expect(firstRecord).toHaveBeenCalledExactlyOnceWith(submission);
  });

  it("rejects a stored transaction without the expected proposal event", async () => {
    const { state, submission } = setupSubmission();
    state.receipt = { ...state.receipt, logs: [] };
    window.localStorage.setItem(RECOVERY_KEY, JSON.stringify(submission));
    const view = render(<ProposalDraftLoader />);
    await act(async () => {});
    expect(mocks.markSubmitted).not.toHaveBeenCalled();
    expect(storedSubmission()).toBeNull();
    expect(view.container.textContent).toContain(
      "did not contain the expected proposal event"
    );
    expect(view.container.textContent).not.toContain(
      "Your propose() transaction has been confirmed"
    );
  });

  it("leaves a changed frozen draft published and removes its recovery hint", async () => {
    const { submission } = setupSubmission();
    window.localStorage.setItem(RECOVERY_KEY, JSON.stringify(submission));
    mocks.useDraft.mockReturnValue({
      data: { ...published, description: "# Different proposal" },
      isLoading: false,
      error: null,
    });
    const view = render(<ProposalDraftLoader />);
    await act(async () => {});
    expect(mocks.markSubmitted).not.toHaveBeenCalled();
    expect(view.container.textContent).toContain(
      "differs from the published draft"
    );
    expect(storedSubmission()).toBeNull();
  });
});
