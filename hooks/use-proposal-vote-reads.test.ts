import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ARBITRUM_CHAIN_ID } from "@/config/arbitrum-governance";
import { GOVERNORS } from "@/config/governors";

import { useProposalHasVoted } from "./use-proposal-has-voted";
import { useProposalVotingPower } from "./use-proposal-voting-power";

/**
 * Both reads go to the proposal's own governor on the governor's chain. An L1
 * voting proposal's governor is on Ethereum and counts the votes of the L2
 * delegate an account claimed, so reading ARB on Arbitrum, or the governor
 * address on Arbitrum, gives the wrong answer there.
 */

const VOTER = "0x1111111111111111111111111111111111111111";
const L1_GOVERNOR = "0x2222222222222222222222222222222222222222";

const mocks = vi.hoisted(() => ({
  useAccount: vi.fn(),
  useReadContract: vi.fn(),
}));

vi.mock("wagmi", () => ({
  useAccount: mocks.useAccount,
  useReadContract: mocks.useReadContract,
}));

function Probe({ run }: { run: () => void }) {
  run();
  return null;
}

function render(run: () => void) {
  renderToStaticMarkup(createElement(Probe, { run }));
}

function lastRead() {
  return mocks.useReadContract.mock.lastCall?.[0];
}

describe("proposal vote reads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useAccount.mockReturnValue({ address: VOTER, isConnected: true });
    mocks.useReadContract.mockReturnValue({
      data: undefined,
      isLoading: false,
    });
  });

  it("reads voting power from the governor on its chain", () => {
    render(() =>
      useProposalVotingPower({
        startBlock: "100",
        governorAddress: L1_GOVERNOR,
        chainId: 1,
      })
    );

    expect(lastRead()).toMatchObject({
      address: L1_GOVERNOR,
      functionName: "getVotes",
      args: [VOTER, BigInt(100)],
      chainId: 1,
      query: { enabled: true },
    });
  });

  it("reads hasVoted from the governor on its chain", () => {
    render(() =>
      useProposalHasVoted({
        proposalId: "7",
        governorAddress: L1_GOVERNOR,
        chainId: 1,
      })
    );

    expect(lastRead()).toMatchObject({
      address: L1_GOVERNOR,
      functionName: "hasVoted",
      args: [BigInt(7), VOTER],
      chainId: 1,
    });
  });

  // Core and Treasury proposals: main read ARB getPastVotes, and the governor
  // forwards getVotes to that same call, so the value is unchanged.
  it.each([
    ["Core", GOVERNORS.core.address],
    ["Treasury", GOVERNORS.treasury.address],
  ])(
    "reads %s voting power from its governor on Arbitrum One",
    (_name, governorAddress) => {
      render(() =>
        useProposalVotingPower({
          startBlock: "100",
          governorAddress: governorAddress as `0x${string}`,
          chainId: ARBITRUM_CHAIN_ID,
        })
      );

      expect(lastRead()).toMatchObject({
        address: governorAddress,
        functionName: "getVotes",
        args: [VOTER, BigInt(100)],
        chainId: ARBITRUM_CHAIN_ID,
        query: { enabled: true },
      });
    }
  );

  it("reads nothing for a visitor with no wallet connected", () => {
    mocks.useAccount.mockReturnValue({
      address: undefined,
      isConnected: false,
    });
    render(() =>
      useProposalVotingPower({
        startBlock: "100",
        governorAddress: GOVERNORS.core.address as `0x${string}`,
        chainId: ARBITRUM_CHAIN_ID,
      })
    );

    expect(lastRead()).toMatchObject({ query: { enabled: false } });
  });

  it("waits for a snapshot block before reading voting power", () => {
    render(() =>
      useProposalVotingPower({
        startBlock: undefined,
        governorAddress: L1_GOVERNOR,
        chainId: 1,
      })
    );

    expect(lastRead()).toMatchObject({ query: { enabled: false } });
  });
});
