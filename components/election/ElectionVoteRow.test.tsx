// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ARBITRUM_CHAIN_ID } from "@/config/arbitrum-governance";

import { ElectionVoteRow } from "./ElectionVoteRow";

/**
 * Election votes go to the election governor on Arbitrum. A wallet on Ethereum
 * must be switched first: the governor has no code there, so an unpinned send
 * would be mined as an empty transaction and reported as a confirmed vote.
 */

const VOTER = "0x1111111111111111111111111111111111111111";
const CANDIDATE = "0x2222222222222222222222222222222222222222";
const GOVERNOR = "0x3333333333333333333333333333333333333333";

const mocks = vi.hoisted(() => ({
  sendTransaction: vi.fn(),
  switchChainAsync: vi.fn(),
  useAccount: vi.fn(),
  useChainId: vi.fn(),
  useEstimateGas: vi.fn(),
  useWaitForTransactionReceipt: vi.fn(),
  toast: Object.assign(vi.fn(), { error: vi.fn() }),
  sendError: { current: null as Error | null },
}));

vi.mock("sonner", () => ({ toast: mocks.toast }));
vi.mock("wagmi", () => ({
  useAccount: mocks.useAccount,
  useChainId: mocks.useChainId,
  useEstimateGas: mocks.useEstimateGas,
  useSendTransaction: () => ({
    data: undefined,
    error: mocks.sendError.current,
    isPending: false,
    sendTransaction: mocks.sendTransaction,
  }),
  useSwitchChain: () => ({
    switchChainAsync: mocks.switchChainAsync,
    isPending: false,
  }),
  useWaitForTransactionReceipt: mocks.useWaitForTransactionReceipt,
}));
vi.mock("@/lib/election-utils", () => ({
  useAddressDisplayRecord: () => undefined,
}));

function connectOn(chainId: number) {
  mocks.useAccount.mockReturnValue({
    address: VOTER,
    isConnected: true,
    chainId,
  });
  mocks.useChainId.mockReturnValue(chainId);
}

function renderRow(chainId: number | undefined = ARBITRUM_CHAIN_ID) {
  const view = render(
    <ElectionVoteRow
      proposalId="1"
      targetAddress={CANDIDATE}
      governorAddress={GOVERNOR}
      chainId={chainId}
      availableVotes={BigInt(10) ** BigInt(20)}
      onVoteSuccess={() => {}}
    />
  );
  fireEvent.change(view.getByPlaceholderText("Amount (ARB)"), {
    target: { value: "1" },
  });
  return view;
}

describe("ElectionVoteRow chain pinning", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sendError.current = null;
    mocks.useEstimateGas.mockReturnValue({ error: null, isError: false });
    mocks.useWaitForTransactionReceipt.mockReturnValue({
      isLoading: false,
      isSuccess: false,
    });
    mocks.switchChainAsync.mockResolvedValue(undefined);
    connectOn(ARBITRUM_CHAIN_ID);
  });

  afterEach(cleanup);

  it("sends the vote pinned to the election chain", async () => {
    const view = renderRow();

    expect(mocks.useEstimateGas).toHaveBeenLastCalledWith(
      expect.objectContaining({ account: VOTER, chainId: ARBITRUM_CHAIN_ID })
    );
    expect(mocks.useWaitForTransactionReceipt).toHaveBeenLastCalledWith(
      expect.objectContaining({ chainId: ARBITRUM_CHAIN_ID })
    );
    fireEvent.click(view.getByRole("button", { name: "Vote" }));

    await waitFor(() =>
      expect(mocks.sendTransaction).toHaveBeenCalledWith(
        expect.objectContaining({ chainId: ARBITRUM_CHAIN_ID, to: GOVERNOR })
      )
    );
    expect(mocks.switchChainAsync).not.toHaveBeenCalled();
  });

  it("asks a wallet on Ethereum to switch instead of voting", async () => {
    connectOn(1);
    const view = renderRow();

    expect(view.queryByRole("button", { name: "Vote" })).toBeNull();
    fireEvent.click(view.getByRole("button", { name: "Switch to Arbitrum" }));

    await waitFor(() =>
      expect(mocks.switchChainAsync).toHaveBeenCalledWith({
        chainId: ARBITRUM_CHAIN_ID,
      })
    );
    expect(mocks.sendTransaction).not.toHaveBeenCalled();
  });

  it("asks a wallet on Arbitrum to switch for a Sepolia election", async () => {
    const view = renderRow(421614);

    expect(mocks.useEstimateGas).toHaveBeenLastCalledWith(
      expect.objectContaining({ chainId: 421614 })
    );
    fireEvent.click(view.getByRole("button", { name: "Switch network" }));

    await waitFor(() =>
      expect(mocks.switchChainAsync).toHaveBeenCalledWith({ chainId: 421614 })
    );
    expect(mocks.sendTransaction).not.toHaveBeenCalled();
  });

  // The switch button covers a wallet that is already elsewhere at render
  // time. A send that still fails, such as a chain change between the last
  // render and the click, has to say so instead of quietly resetting.
  it("reports a failed send", () => {
    mocks.sendError.current = new Error("Chain mismatch");
    renderRow();

    expect(mocks.toast.error).toHaveBeenCalledWith(
      expect.stringContaining("Chain mismatch")
    );
  });

  it("stays quiet when the user rejects the vote", () => {
    mocks.sendError.current = Object.assign(
      new Error("User rejected the request."),
      { code: 4001 }
    );
    renderRow();

    expect(mocks.toast.error).not.toHaveBeenCalled();
  });
});
