// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ARBITRUM_CHAIN_ID } from "@/config/arbitrum-governance";
import { GOVERNORS } from "@/config/governors";

import VoteForm from "./VoteForm";

/**
 * A vote must go to the governor's own chain. Ethereum is a supported wallet
 * network, so a wallet sitting there has to be switched before anything is
 * sent: the governor address has no code on the other chain and the wallet
 * would mine an empty transaction.
 */

const VOTER = "0x1111111111111111111111111111111111111111";
const L1_GOVERNOR = "0x2222222222222222222222222222222222222222";

const mocks = vi.hoisted(() => ({
  sendTransaction: vi.fn(),
  switchChainAsync: vi.fn(),
  useAccount: vi.fn(),
  useChainId: vi.fn(),
  useEstimateGas: vi.fn(),
  useProposalVotingPower: vi.fn(),
  useProposalHasVoted: vi.fn(),
  toast: Object.assign(vi.fn(), { error: vi.fn() }),
}));

vi.mock("sonner", () => ({ toast: mocks.toast }));
vi.mock("wagmi", () => ({
  useAccount: mocks.useAccount,
  useChainId: mocks.useChainId,
  useEstimateGas: mocks.useEstimateGas,
  useSendTransaction: () => ({
    data: undefined,
    isPending: false,
    isSuccess: false,
    sendTransaction: mocks.sendTransaction,
  }),
  useSwitchChain: () => ({
    switchChainAsync: mocks.switchChainAsync,
    isPending: false,
  }),
}));
vi.mock("@/hooks/use-proposal-voting-power", () => ({
  useProposalVotingPower: mocks.useProposalVotingPower,
}));
vi.mock("@/hooks/use-proposal-has-voted", () => ({
  useProposalHasVoted: mocks.useProposalHasVoted,
}));
vi.mock("@/hooks/use-user-vote", () => ({
  useUserVote: () => ({ data: null, isLoading: false }),
}));

// Radix's radio indicator measures itself once an option is selected.
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
);

const proposal = {
  id: "1",
  proposer: VOTER,
  contractAddress: GOVERNORS.treasury.address,
  targets: [],
  values: [],
  signatures: [],
  calldatas: [],
  startBlock: "1",
  endBlock: "2",
  description: "Test",
  networkId: String(ARBITRUM_CHAIN_ID),
  state: "active",
};

function connectOn(chainId: number) {
  mocks.useAccount.mockReturnValue({
    address: VOTER,
    isConnected: true,
    chainId,
  });
  mocks.useChainId.mockReturnValue(chainId);
}

function renderUnselected(overrides: Partial<typeof proposal> = {}) {
  return render(
    <VoteForm proposal={{ ...proposal, ...overrides }} variant="page" />
  );
}

function renderForm(overrides: Partial<typeof proposal> = {}) {
  const view = renderUnselected(overrides);
  fireEvent.click(view.getByRole("radio", { name: "For" }));
  return view;
}

function setVotingPower(votingPower: bigint | undefined) {
  mocks.useProposalVotingPower.mockReturnValue({
    votingPower,
    isLoadingVotingPower: false,
  });
}

describe("VoteForm chain pinning", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useEstimateGas.mockReturnValue({ error: null, isError: false });
    mocks.switchChainAsync.mockResolvedValue(undefined);
    connectOn(ARBITRUM_CHAIN_ID);
    setVotingPower(BigInt(10));
    mocks.useProposalHasVoted.mockReturnValue({
      hasVoted: false,
      hasRecordedVote: false,
      isLoadingHasVoted: false,
    });
  });

  afterEach(cleanup);

  it("sends the vote pinned to the governor's chain", async () => {
    const view = renderForm();

    expect(mocks.useEstimateGas).toHaveBeenLastCalledWith(
      expect.objectContaining({ account: VOTER, chainId: ARBITRUM_CHAIN_ID })
    );
    fireEvent.click(view.getByRole("button", { name: "Vote" }));

    await waitFor(() =>
      expect(mocks.sendTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          chainId: ARBITRUM_CHAIN_ID,
          to: GOVERNORS.treasury.address,
        })
      )
    );
    expect(mocks.switchChainAsync).not.toHaveBeenCalled();
  });

  it("asks a wallet on Ethereum to switch instead of voting", async () => {
    connectOn(1);
    const view = renderForm();

    expect(view.queryByRole("button", { name: "Vote" })).toBeNull();
    fireEvent.click(view.getByRole("button", { name: "Switch to Arbitrum" }));

    await waitFor(() =>
      expect(mocks.switchChainAsync).toHaveBeenCalledWith({
        chainId: ARBITRUM_CHAIN_ID,
      })
    );
    expect(mocks.sendTransaction).not.toHaveBeenCalled();
  });

  it("does not send when a submit on the wrong network is refused the switch", async () => {
    connectOn(1);
    mocks.switchChainAsync.mockRejectedValue(
      Object.assign(new Error("User rejected the request."), { code: 4001 })
    );
    const view = renderForm();

    fireEvent.submit(view.container.querySelector("form")!);

    await waitFor(() =>
      expect(mocks.switchChainAsync).toHaveBeenCalledWith({
        chainId: ARBITRUM_CHAIN_ID,
      })
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mocks.sendTransaction).not.toHaveBeenCalled();
  });

  it("switches first, then sends on the governor's chain, when a submit slips through", async () => {
    connectOn(1);
    const view = renderForm();

    fireEvent.submit(view.container.querySelector("form")!);

    await waitFor(() => expect(mocks.sendTransaction).toHaveBeenCalled());
    expect(mocks.switchChainAsync).toHaveBeenCalledWith({
      chainId: ARBITRUM_CHAIN_ID,
    });
    expect(mocks.sendTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ chainId: ARBITRUM_CHAIN_ID })
    );
  });

  it("targets Ethereum for an L1 voting proposal", async () => {
    const view = renderForm({ contractAddress: L1_GOVERNOR, networkId: "1" });

    expect(mocks.useEstimateGas).toHaveBeenLastCalledWith(
      expect.objectContaining({ chainId: 1 })
    );
    fireEvent.click(view.getByRole("button", { name: "Switch network" }));

    await waitFor(() =>
      expect(mocks.switchChainAsync).toHaveBeenCalledWith({ chainId: 1 })
    );
    expect(mocks.sendTransaction).not.toHaveBeenCalled();
  });

  it("reads voting power and vote status from the L1 governor on Ethereum", () => {
    renderForm({ contractAddress: L1_GOVERNOR, networkId: "1" });

    const pinnedToL1 = expect.objectContaining({
      governorAddress: L1_GOVERNOR,
      chainId: 1,
    });
    expect(mocks.useProposalVotingPower).toHaveBeenLastCalledWith(pinnedToL1);
    expect(mocks.useProposalHasVoted).toHaveBeenLastCalledWith(pinnedToL1);
  });

  it("offers the switch for an L1 proposal while its voting power is unproven", () => {
    // The L1 governor reverts on unclaimed or unproven votes instead of
    // returning 0, so the read stays undefined and the form stays up.
    setVotingPower(undefined);
    const view = renderUnselected({
      contractAddress: L1_GOVERNOR,
      networkId: "1",
    });

    expect(view.getByRole("button", { name: "Switch network" })).toBeTruthy();
  });

  it("hides the vote action when the governor reports no voting power", () => {
    // The read is the governor's own count on its own chain, so 0 holds
    // whatever chain the wallet is on, and a switch would not help.
    setVotingPower(BigInt(0));
    const view = renderUnselected({
      contractAddress: L1_GOVERNOR,
      networkId: "1",
    });

    expect(view.queryByRole("button", { name: "Switch network" })).toBeNull();
    expect(view.getByText(/You need to delegate ARB tokens/)).toBeTruthy();
  });
});
