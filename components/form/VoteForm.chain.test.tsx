// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { decodeFunctionData, parseAbi, type Hex } from "viem";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { VOTE_SUPPORT } from "@gzeoneth/gov-tracker";

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
  sendError: { current: null as Error | null },
  sendStatus: { isPending: false, isSuccess: false },
}));

vi.mock("sonner", () => ({ toast: mocks.toast }));
vi.mock("wagmi", () => ({
  useAccount: mocks.useAccount,
  useChainId: mocks.useChainId,
  useEstimateGas: mocks.useEstimateGas,
  useSendTransaction: () => ({
    data: undefined,
    error: mocks.sendError.current,
    ...mocks.sendStatus,
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
    mocks.sendError.current = null;
    mocks.sendStatus = { isPending: false, isSuccess: false };
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

  // The switch button is the only guard, so the form must offer no way to
  // submit while the wallet is elsewhere.
  it("renders no submit control while on the wrong network", () => {
    connectOn(1);
    const view = renderForm();

    expect(view.container.querySelector('button[type="submit"]')).toBeNull();
  });

  // A send that still fails, such as a chain change between the last render
  // and the click, has to say so instead of quietly resetting.
  it("reports a failed send", () => {
    mocks.sendError.current = new Error("Chain mismatch");
    renderForm();

    expect(mocks.toast.error).toHaveBeenCalledWith(
      expect.stringContaining("Chain mismatch")
    );
  });

  it("stays quiet when the user rejects the vote", () => {
    mocks.sendError.current = Object.assign(
      new Error("User rejected the request."),
      { code: 4001 }
    );
    renderForm();

    expect(mocks.toast.error).not.toHaveBeenCalled();
  });

  // Moving the wallet after a vote changes nothing about the vote already
  // sent, so the form keeps saying so instead of asking for a switch.
  it.each([
    ["Voted", { isPending: false, isSuccess: true }],
    ["Voting", { isPending: true, isSuccess: false }],
  ])(
    "keeps showing %s when the wallet leaves Arbitrum One after sending",
    (label, status) => {
      mocks.sendStatus = status;
      connectOn(1);
      const view = renderForm();

      expect(view.getByRole("button", { name: label })).toBeTruthy();
      expect(view.queryByRole("button", { name: /Switch/ })).toBeNull();
    }
  );

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

  // Arbitrum One votes are the ones in use today. These pin the whole
  // transaction, decoded independently of gov-tracker, so nothing added for L1
  // voting can change what an Arbitrum vote sends.
  describe("on Arbitrum One", () => {
    const CAST_VOTE_ABI = parseAbi([
      "function castVote(uint256 proposalId, uint8 support)",
    ]);
    const cases = [
      ["Core", GOVERNORS.core.address],
      ["Treasury", GOVERNORS.treasury.address],
    ].flatMap(([governor, address]) =>
      (
        [
          ["For", VOTE_SUPPORT.FOR],
          ["Against", VOTE_SUPPORT.AGAINST],
          ["Abstain", VOTE_SUPPORT.ABSTAIN],
        ] as const
      ).map(([label, support]) => [governor, label, address, support] as const)
    );

    it.each(cases)(
      "%s governor: a %s vote sends castVote to that governor on Arbitrum One",
      async (_governor, label, governorAddress, support) => {
        const view = renderUnselected({ contractAddress: governorAddress });
        fireEvent.click(view.getByRole("radio", { name: label }));
        fireEvent.click(view.getByRole("button", { name: "Vote" }));

        await waitFor(() =>
          expect(mocks.sendTransaction).toHaveBeenCalledTimes(1)
        );
        const sent = mocks.sendTransaction.mock.calls[0][0];
        expect(Object.keys(sent).sort()).toEqual(["chainId", "data", "to"]);
        expect(sent.chainId).toBe(ARBITRUM_CHAIN_ID);
        expect(sent.to.toLowerCase()).toBe(governorAddress.toLowerCase());
        expect(
          decodeFunctionData({ abi: CAST_VOTE_ABI, data: sent.data as Hex })
        ).toEqual({
          functionName: "castVote",
          args: [BigInt(proposal.id), support],
        });

        // The estimate that enables the button simulates that same call.
        expect(mocks.useEstimateGas).toHaveBeenLastCalledWith(
          expect.objectContaining({
            account: VOTER,
            chainId: ARBITRUM_CHAIN_ID,
            to: sent.to,
            data: sent.data,
          })
        );
      }
    );

    it("reads voting power and vote status from the governor on Arbitrum One", () => {
      renderUnselected({ contractAddress: GOVERNORS.core.address });

      expect(mocks.useProposalVotingPower).toHaveBeenLastCalledWith({
        startBlock: proposal.startBlock,
        governorAddress: GOVERNORS.core.address,
        chainId: ARBITRUM_CHAIN_ID,
      });
      expect(mocks.useProposalHasVoted).toHaveBeenLastCalledWith({
        proposalId: proposal.id,
        governorAddress: GOVERNORS.core.address,
        chainId: ARBITRUM_CHAIN_ID,
      });
    });

    it("shows Vote and no switch to a wallet already on Arbitrum One", () => {
      const view = renderForm();

      expect(view.getByRole("button", { name: "Vote" })).toBeTruthy();
      expect(view.queryByRole("button", { name: /Switch/ })).toBeNull();
    });

    it("stays on Arbitrum One for a proposal that carries no chain", async () => {
      const view = renderForm({ networkId: undefined });

      expect(view.queryByRole("button", { name: /Switch/ })).toBeNull();
      fireEvent.click(view.getByRole("button", { name: "Vote" }));
      await waitFor(() =>
        expect(mocks.sendTransaction).toHaveBeenCalledWith(
          expect.objectContaining({ chainId: ARBITRUM_CHAIN_ID })
        )
      );
    });

    // Core and Treasury are known by address, so a wrong chain on the row
    // (from the indexer) cannot move the vote off Arbitrum One.
    it("votes on Arbitrum One even when the row names another chain", async () => {
      const view = renderForm({
        contractAddress: GOVERNORS.core.address,
        networkId: "1",
      });

      expect(view.queryByRole("button", { name: /Switch/ })).toBeNull();
      fireEvent.click(view.getByRole("button", { name: "Vote" }));
      await waitFor(() =>
        expect(mocks.sendTransaction).toHaveBeenCalledWith(
          expect.objectContaining({
            chainId: ARBITRUM_CHAIN_ID,
            to: GOVERNORS.core.address,
          })
        )
      );
      expect(mocks.useProposalVotingPower).toHaveBeenLastCalledWith(
        expect.objectContaining({ chainId: ARBITRUM_CHAIN_ID })
      );
    });

    it("offers no switch to a visitor with no wallet connected", () => {
      mocks.useAccount.mockReturnValue({
        address: undefined,
        isConnected: false,
        chainId: undefined,
      });
      mocks.useChainId.mockReturnValue(ARBITRUM_CHAIN_ID);
      const view = renderForm();

      expect(view.queryByRole("button", { name: /Switch/ })).toBeNull();
      expect(mocks.sendTransaction).not.toHaveBeenCalled();
    });
  });
});
