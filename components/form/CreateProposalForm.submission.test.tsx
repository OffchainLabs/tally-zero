// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GOVERNORS } from "@/config/governors";

import CreateProposalForm, {
  type ProposalReplacement,
} from "./CreateProposalForm";
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
  // Mirrors useWriteContract: a rejected write rejects the promise and then
  // surfaces as `error` on the next render. The form renders that `error`;
  // the catch in handleSubmit only keeps the rejection from going unhandled.
  mocks.useWriteContract.mockImplementation(() => {
    const [error, setError] = useState<Error | null>(null);
    return {
      error,
      isPending: false,
      writeContractAsync: async (request: unknown) => {
        try {
          return await writeContractAsync(request);
        } catch (writeFailure) {
          setError(writeFailure as Error);
          throw writeFailure;
        }
      },
    };
  });
  // Mirrors useWaitForTransactionReceipt: @wagmi/core throws on a reverted
  // receipt, so a revert arrives as `error` with no data, never as a resolved
  // receipt with status "reverted".
  const state: {
    confirmed: boolean;
    receiptError: Error | null;
    onReplaced: ((replacement: ProposalReplacement) => void) | undefined;
  } = {
    confirmed: true,
    receiptError: null,
    onReplaced: undefined,
  };
  mocks.useWaitForTransactionReceipt.mockImplementation(
    ({
      hash,
      onReplaced,
    }: {
      hash?: string;
      onReplaced?: (replacement: ProposalReplacement) => void;
    }) => {
      state.onReplaced = onReplaced;
      if (!hash) {
        return {
          data: undefined,
          isLoading: false,
          isSuccess: false,
          error: null,
        };
      }
      if (state.receiptError) {
        return {
          data: undefined,
          isLoading: false,
          isSuccess: false,
          error: state.receiptError,
        };
      }
      return {
        data: state.confirmed ? receipt : undefined,
        isLoading: !state.confirmed,
        isSuccess: state.confirmed,
        error: null,
      };
    }
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

  it("shows the revert reason as a failure and allows another submission", async () => {
    const { state } = setupSubmission();
    state.receiptError = new Error(
      "Governor: proposer votes below proposal threshold"
    );
    const view = render(<CreateProposalForm initialDraft={stored} />);
    await submit(view);
    expect(view.container.textContent).toContain(
      "Governor: proposer votes below proposal threshold"
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

  it.each([
    ["repriced", "Proposal transaction gas fee was updated in your wallet."],
    ["replaced", "Proposal transaction was replaced in your wallet."],
  ] as const)(
    "forwards a %s transaction to onProposalReplaced",
    async (reason, notice) => {
      const { state, transactionHash } = setupSubmission();
      state.confirmed = false;
      const onProposalReplaced = vi.fn();
      const view = render(
        <CreateProposalForm
          initialDraft={stored}
          onProposalReplaced={onProposalReplaced}
        />
      );
      await submit(view);
      const replacement = {
        reason,
        transactionReceipt: {
          status: "success",
          transactionHash: `0x${"cd".repeat(32)}`,
          logs: [],
        },
      } as unknown as ProposalReplacement;
      await act(async () => state.onReplaced?.(replacement));
      expect(onProposalReplaced).toHaveBeenCalledExactlyOnceWith(replacement);
      expect(mocks.toast).toHaveBeenCalledWith(notice);
      expect(
        mocks.useWaitForTransactionReceipt.mock.calls.at(-1)?.[0].hash
      ).toBe(replacement.transactionReceipt.transactionHash);
      expect(
        mocks.useWaitForTransactionReceipt.mock.calls.at(-1)?.[0].hash
      ).not.toBe(transactionHash);
    }
  );

  it("forwards a cancellation to onProposalReplaced and stops tracking", async () => {
    const { state } = setupSubmission();
    state.confirmed = false;
    const onProposalReplaced = vi.fn();
    const view = render(
      <CreateProposalForm
        initialDraft={stored}
        onProposalReplaced={onProposalReplaced}
      />
    );
    await submit(view);
    const replacement = {
      reason: "cancelled",
      transactionReceipt: {
        status: "success",
        transactionHash: `0x${"cd".repeat(32)}`,
        logs: [],
      },
    } as unknown as ProposalReplacement;
    await act(async () => state.onReplaced?.(replacement));
    expect(onProposalReplaced).toHaveBeenCalledExactlyOnceWith(replacement);
    expect(view.container.textContent).toContain(
      "Proposal transaction was cancelled in your wallet."
    );
    expect(
      mocks.useWaitForTransactionReceipt.mock.calls.at(-1)?.[0].hash
    ).toBeUndefined();
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
    expect(view.container.textContent).toContain("User rejected the request");
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
