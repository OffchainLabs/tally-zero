// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GOVERNORS } from "@/config/governors";

import CreateProposalForm from "./CreateProposalForm";
import { installStorage, stored } from "./CreateProposalForm.test-helpers";

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
  const writeContractAsync = vi.fn().mockResolvedValue(transactionHash);
  mocks.useWriteContract.mockReturnValue({
    error: null,
    isPending: false,
    writeContractAsync,
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
    writeContractAsync,
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
      writeContractAsync: vi.fn(),
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

  it("handles a rejected wallet request without reporting a broadcast", async () => {
    const { writeContractAsync } = setupSubmission();
    writeContractAsync.mockRejectedValue(
      new Error("User rejected the request")
    );
    const onProposalSubmitted = vi.fn();
    const view = render(
      <CreateProposalForm
        initialDraft={stored}
        onProposalSubmitted={onProposalSubmitted}
      />
    );
    await submit(view);
    expect(writeContractAsync).toHaveBeenCalledOnce();
    expect(onProposalSubmitted).not.toHaveBeenCalled();
    expect(view.container.textContent).not.toContain(
      "Your propose() transaction has been confirmed"
    );
    expect(
      view
        .getByRole("button", { name: "Submit Proposal" })
        .hasAttribute("disabled")
    ).toBe(false);
  });
});
