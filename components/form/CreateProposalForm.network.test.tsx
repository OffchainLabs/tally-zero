// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ARBITRUM_CHAIN_ID } from "@/config/arbitrum-governance";

import CreateProposalForm from "./CreateProposalForm";
import { installStorage, stored } from "./CreateProposalForm.test-helpers";

/**
 * A proposal goes to a governor on Arbitrum One. Ethereum is a supported
 * wallet network (for L1 voting), so AppKit no longer steers a wallet there
 * back to Arbitrum. The pinned simulation still passes, so the form itself
 * has to offer the switch, or Submit fails with a chain mismatch.
 */

const PROPOSER = "0x1111111111111111111111111111111111111111";

const mocks = vi.hoisted(() => ({
  useAccount: vi.fn(),
  useChainId: vi.fn(),
  switchChainAsync: vi.fn(),
  writeContractAsync: vi.fn(),
  useGovernanceClock: vi.fn(),
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
  useChainId: mocks.useChainId,
  useSwitchChain: () => ({
    switchChainAsync: mocks.switchChainAsync,
    isPending: false,
  }),
  useReadContract: (options: { functionName?: string }) => ({
    data:
      options.functionName === "proposalThreshold" ? BigInt(0) : BigInt(100),
    isLoading: false,
  }),
  useSimulateContract: () => ({
    data: { request: {} },
    error: null,
    isError: false,
    isFetching: false,
  }),
  useWriteContract: () => ({
    error: null,
    isPending: false,
    writeContractAsync: mocks.writeContractAsync,
  }),
  useWaitForTransactionReceipt: () => ({
    isLoading: false,
    isSuccess: false,
    error: null,
  }),
}));
vi.mock("@/hooks/use-governance-clock", () => ({
  useGovernanceClock: mocks.useGovernanceClock,
}));

function connectOn(chainId: number) {
  mocks.useAccount.mockReturnValue({
    address: PROPOSER,
    isConnected: true,
    chainId,
  });
  mocks.useChainId.mockReturnValue(chainId);
}

describe("CreateProposalForm network", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installStorage();
    mocks.useGovernanceClock.mockReturnValue({
      clockBlock: BigInt(23_456_789),
      isLoading: false,
    });
    mocks.switchChainAsync.mockResolvedValue(undefined);
    mocks.writeContractAsync.mockResolvedValue(`0x${"ab".repeat(32)}`);
  });

  afterEach(cleanup);

  it("submits from a wallet on Arbitrum One", async () => {
    connectOn(ARBITRUM_CHAIN_ID);
    const view = render(<CreateProposalForm initialDraft={stored} />);

    expect(view.queryByRole("button", { name: "Switch to Arbitrum" })).toBe(
      null
    );
    await act(async () => {
      fireEvent.click(view.getByRole("button", { name: "Submit Proposal" }));
    });
    expect(mocks.writeContractAsync).toHaveBeenCalledTimes(1);
  });

  it("asks a wallet on Ethereum to switch instead of submitting", async () => {
    connectOn(1);
    const view = render(<CreateProposalForm initialDraft={stored} />);

    expect(view.queryByRole("button", { name: "Submit Proposal" })).toBe(null);
    await act(async () => {
      fireEvent.click(view.getByRole("button", { name: "Switch to Arbitrum" }));
    });
    expect(mocks.switchChainAsync).toHaveBeenCalledWith({
      chainId: ARBITRUM_CHAIN_ID,
    });
    expect(mocks.writeContractAsync).not.toHaveBeenCalled();
  });

  it("keeps the form when the switch is rejected", async () => {
    connectOn(1);
    mocks.switchChainAsync.mockRejectedValue(
      Object.assign(new Error("User rejected the request."), { code: 4001 })
    );
    const view = render(<CreateProposalForm initialDraft={stored} />);

    await act(async () => {
      fireEvent.click(view.getByRole("button", { name: "Switch to Arbitrum" }));
    });
    expect(
      view.getByRole("button", { name: "Switch to Arbitrum" })
    ).toBeTruthy();
    expect(mocks.writeContractAsync).not.toHaveBeenCalled();
    expect(mocks.toast.error).not.toHaveBeenCalled();
  });
});
