// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GOVERNORS } from "@/config/governors";

import CreateProposalForm from "./CreateProposalForm";

const mocks = vi.hoisted(() => ({
  useAccount: vi.fn(),
  useGovernanceClock: vi.fn(),
  useReadContract: vi.fn(),
  useSimulateContract: vi.fn(),
  useWaitForTransactionReceipt: vi.fn(),
  useWriteContract: vi.fn(),
  toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
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

function setupSubmission() {
  const transactionHash = `0x${"ab".repeat(32)}` as `0x${string}`;
  const receipt = { status: "success", transactionHash, logs: [] };
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
    writeContract,
  };
}

async function submit(view: ReturnType<typeof render>) {
  await act(async () => {
    fireEvent.click(view.getByRole("button", { name: "Submit Proposal" }));
  });
}

describe("proposal broadcast and failure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    installStorage();

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

  it("reports the hash at broadcast while confirmation is still pending", async () => {
    const { state, transactionHash } = setupSubmission();
    state.confirmed = false;
    const onProposalSubmitted = vi.fn();
    const view = render(
      <CreateProposalForm
        initialDraft={stored}
        onProposalSubmitted={onProposalSubmitted}
      />
    );
    await submit(view);
    expect(onProposalSubmitted).toHaveBeenCalledExactlyOnceWith({
      hash: transactionHash,
      governorAddress: GOVERNORS.core.address,
    });
    expect(view.container.textContent).not.toContain(
      "Your propose() transaction has been confirmed"
    );
  });

  it("shows a reverted receipt as a failure and allows another submission", async () => {
    const { state } = setupSubmission();
    state.receipt = { ...state.receipt, status: "reverted" };
    const view = render(<CreateProposalForm initialDraft={stored} />);
    await submit(view);
    expect(view.container.textContent).toContain(
      "Proposal transaction reverted"
    );
    expect(view.container.textContent).not.toContain(
      "Your propose() transaction has been confirmed"
    );
    expect(
      view
        .getByRole("button", { name: "Submit Proposal" })
        .hasAttribute("disabled")
    ).toBe(false);
    expect(mocks.toast).not.toHaveBeenCalledWith("Proposal submitted.");
  });
});
