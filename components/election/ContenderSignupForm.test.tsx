// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ARBITRUM_CHAIN_ID } from "@/config/arbitrum-governance";

import { ContenderSignupForm } from "./ContenderSignupForm";

/**
 * Contender registration is signed for, and sent to, the nominee governor on
 * Arbitrum. A wallet on Ethereum is asked to switch before it can sign or send.
 */

const CONTENDER = "0x1111111111111111111111111111111111111111";
const GOVERNOR = "0x3333333333333333333333333333333333333333";
const SIGNATURE = `0x${"11".repeat(65)}`;

const mocks = vi.hoisted(() => ({
  sendTransaction: vi.fn(),
  signTypedData: vi.fn(),
  switchChainAsync: vi.fn(),
  useAccount: vi.fn(),
  useChainId: vi.fn(),
  useEstimateGas: vi.fn(),
  useSignTypedData: vi.fn(),
  toast: Object.assign(vi.fn(), { error: vi.fn() }),
  sendError: { current: null as Error | null },
}));

vi.mock("sonner", () => ({ toast: mocks.toast }));
vi.mock("wagmi", () => ({
  useAccount: mocks.useAccount,
  useChainId: mocks.useChainId,
  useEstimateGas: mocks.useEstimateGas,
  useReadContract: ({ functionName }: { functionName: string }) => ({
    data:
      functionName === "name"
        ? "SecurityCouncilNomineeElectionGovernor"
        : false,
    refetch: vi.fn(),
  }),
  useSendTransaction: () => ({
    data: undefined,
    error: mocks.sendError.current,
    isPending: false,
    isSuccess: false,
    sendTransaction: mocks.sendTransaction,
  }),
  useSignTypedData: mocks.useSignTypedData,
  useSwitchChain: () => ({
    switchChainAsync: mocks.switchChainAsync,
    isPending: false,
  }),
}));
vi.mock("@/hooks/use-election-contracts", () => ({
  useElectionContracts: () => ({
    nomineeGovernorAddress: GOVERNOR,
    memberGovernorAddress: GOVERNOR,
    tokenAddress: GOVERNOR,
    chainId: ARBITRUM_CHAIN_ID,
  }),
}));

function connectOn(chainId: number) {
  mocks.useAccount.mockReturnValue({
    address: CONTENDER,
    isConnected: true,
    chainId,
  });
  mocks.useChainId.mockReturnValue(chainId);
}

function signed(signature: string | undefined) {
  mocks.useSignTypedData.mockReturnValue({
    data: signature,
    signTypedData: mocks.signTypedData,
    isPending: false,
    reset: vi.fn(),
  });
}

describe("ContenderSignupForm chain pinning", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sendError.current = null;
    mocks.useEstimateGas.mockReturnValue({ error: null, isError: false });
    mocks.switchChainAsync.mockResolvedValue(undefined);
    connectOn(ARBITRUM_CHAIN_ID);
    signed(SIGNATURE);
  });

  afterEach(cleanup);

  it("sends the registration pinned to the election chain", async () => {
    const view = render(<ContenderSignupForm proposalId="1" />);

    expect(mocks.useEstimateGas).toHaveBeenLastCalledWith(
      expect.objectContaining({
        account: CONTENDER,
        chainId: ARBITRUM_CHAIN_ID,
      })
    );
    fireEvent.click(view.getByRole("button", { name: "Submit Registration" }));

    await waitFor(() =>
      expect(mocks.sendTransaction).toHaveBeenCalledWith(
        expect.objectContaining({ chainId: ARBITRUM_CHAIN_ID, to: GOVERNOR })
      )
    );
    expect(mocks.switchChainAsync).not.toHaveBeenCalled();
  });

  it("asks a wallet on Ethereum to switch instead of submitting", async () => {
    connectOn(1);
    const view = render(<ContenderSignupForm proposalId="1" />);

    expect(
      view.queryByRole("button", { name: "Submit Registration" })
    ).toBeNull();
    fireEvent.click(view.getByRole("button", { name: "Switch to Arbitrum" }));

    await waitFor(() =>
      expect(mocks.switchChainAsync).toHaveBeenCalledWith({
        chainId: ARBITRUM_CHAIN_ID,
      })
    );
    expect(mocks.sendTransaction).not.toHaveBeenCalled();
  });

  it("asks a wallet on Ethereum to switch before signing", () => {
    connectOn(1);
    signed(undefined);
    const view = render(<ContenderSignupForm proposalId="1" />);

    expect(
      view.queryByRole("button", { name: "Register as Contender" })
    ).toBeNull();
    expect(
      view.getByRole("button", { name: "Switch to Arbitrum" })
    ).toBeTruthy();
    expect(mocks.signTypedData).not.toHaveBeenCalled();
  });

  // The switch button covers a wallet that is already elsewhere at render
  // time. A send that still fails, such as a chain change between the last
  // render and the click, has to say so instead of quietly resetting.
  it("reports a failed send", () => {
    mocks.sendError.current = new Error("Chain mismatch");
    render(<ContenderSignupForm proposalId="1" />);

    expect(mocks.toast.error).toHaveBeenCalledWith(
      expect.stringContaining("Chain mismatch")
    );
  });

  it("stays quiet when the user rejects the registration", () => {
    mocks.sendError.current = Object.assign(
      new Error("User rejected the request."),
      { code: 4001 }
    );
    render(<ContenderSignupForm proposalId="1" />);

    expect(mocks.toast.error).not.toHaveBeenCalled();
  });
});
