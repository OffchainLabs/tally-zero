import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useElectionVotingPower } from "./use-election-voting-power";

/**
 * Every read goes to the election chain. The wallet can sit on Ethereum, which
 * wagmi now configures, and the election governors have no code there, so an
 * unpinned read comes back empty and the voting-power panel loses MAX and the
 * over-budget guard.
 */

const VOTER = "0x1111111111111111111111111111111111111111";
const GOVERNOR = "0x2222222222222222222222222222222222222222";
const TOKEN = "0x3333333333333333333333333333333333333333";
// Not 42161, which gov-tracker's read helpers default to: the assertions only
// prove the reads are pinned if the expected chain differs from that default.
const ELECTION_CHAIN_ID = 421614;

const mocks = vi.hoisted(() => ({
  useAccount: vi.fn(),
  useReadContract: vi.fn(),
  useElectionContracts: vi.fn(),
}));

vi.mock("wagmi", () => ({
  useAccount: mocks.useAccount,
  useReadContract: mocks.useReadContract,
}));

vi.mock("@/hooks/use-election-contracts", () => ({
  useElectionContracts: mocks.useElectionContracts,
}));

function Probe() {
  useElectionVotingPower({
    proposalId: "7",
    governorAddress: GOVERNOR,
    governorReadAbi: [],
  });
  return null;
}

function readsByFunction() {
  return new Map(
    mocks.useReadContract.mock.calls.map(([args]) => [args.functionName, args])
  );
}

describe("useElectionVotingPower", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useAccount.mockReturnValue({ address: VOTER, isConnected: true });
    mocks.useElectionContracts.mockReturnValue({
      tokenAddress: TOKEN,
      chainId: ELECTION_CHAIN_ID,
    });
    mocks.useReadContract.mockImplementation(
      ({ functionName }: { functionName: string }) => ({
        data: functionName === "proposalSnapshot" ? BigInt(100) : undefined,
        refetch: vi.fn(),
      })
    );
  });

  it("pins every read to the election chain", () => {
    renderToStaticMarkup(createElement(Probe));

    const reads = readsByFunction();
    expect([...reads.keys()].sort()).toEqual([
      "getPastVotes",
      "proposalSnapshot",
      "votesUsed",
    ]);
    for (const read of reads.values()) {
      expect(read.chainId).toBe(ELECTION_CHAIN_ID);
    }
  });

  it("reads voting power from the election token at the snapshot", () => {
    renderToStaticMarkup(createElement(Probe));

    expect(readsByFunction().get("getPastVotes")).toMatchObject({
      address: TOKEN,
      args: [VOTER, BigInt(100)],
      chainId: ELECTION_CHAIN_ID,
      query: { enabled: true },
    });
  });
});
