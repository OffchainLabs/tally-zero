import { describe, expect, it } from "vitest";

import { registerL1VotingGovernor } from "@/config/governors";

import {
  getL1ExecutionStages,
  governorChainId,
  isL1VotingProposal,
  L1_EXECUTION_PHASES,
  proposalChainId,
} from "./l1-voting";

const L1_GOVERNOR = "0x00000000000000000000000000000000000a11a1";

describe("isL1VotingProposal", () => {
  it("trusts the indexer's governor kind", () => {
    expect(isL1VotingProposal({ governorType: "L1_VOTING" })).toBe(true);
    // An explicit L2 kind wins over anything else.
    expect(
      isL1VotingProposal({ governorType: "CONSTITUTIONAL", networkId: "1" })
    ).toBe(false);
  });

  it("falls back to the chain, then to registered addresses", () => {
    expect(isL1VotingProposal({ networkId: "1" })).toBe(true);
    expect(isL1VotingProposal({ networkId: "1337" })).toBe(true);
    expect(isL1VotingProposal({ networkId: "42161" })).toBe(false);

    const address = "0x00000000000000000000000000000000000b11b1";
    expect(isL1VotingProposal({ contractAddress: address })).toBe(false);
    registerL1VotingGovernor(address, 1);
    expect(isL1VotingProposal({ contractAddress: address })).toBe(true);
  });

  it("is false for a bare L2 row", () => {
    expect(isL1VotingProposal({ contractAddress: L1_GOVERNOR })).toBe(false);
  });
});

// The proposal link and the vote reads and sends share this rule, so a row with
// an odd networkId cannot link to one chain and vote on another.
describe("governorChainId", () => {
  const UNREGISTERED = "0x00000000000000000000000000000000000c33c3";
  const REGISTERED = "0x00000000000000000000000000000000000d44d4";
  registerL1VotingGovernor(REGISTERED, 1);

  it.each([
    ["1", UNREGISTERED, 1],
    [1, UNREGISTERED, 1],
    ["42161", REGISTERED, 42161],
    ["1337", REGISTERED, 1337],
    ["", UNREGISTERED, 42161],
    ["", REGISTERED, 1],
    ["abc", REGISTERED, 1],
    ["-1", UNREGISTERED, 42161],
    ["-1", REGISTERED, 1],
    ["1.5", UNREGISTERED, 42161],
    [undefined, UNREGISTERED, 42161],
    [undefined, REGISTERED, 1],
    [undefined, undefined, 42161],
  ])("networkId %j on %s is chain %i", (chainId, address, expected) => {
    expect(governorChainId(chainId, address)).toBe(expected);
  });

  it("is what proposalChainId answers for a proposal", () => {
    expect(
      proposalChainId({ networkId: "", contractAddress: REGISTERED })
    ).toBe(1);
    expect(proposalChainId({ networkId: "-1" })).toBe(42161);
  });
});

describe("getL1ExecutionStages", () => {
  const statuses = (phase: string | null, cancelled = false) =>
    getL1ExecutionStages(phase, cancelled).map((stage) => stage.status);

  it("lists the four phases in order", () => {
    expect(getL1ExecutionStages(null).map((stage) => stage.phase)).toEqual([
      ...L1_EXECUTION_PHASES,
    ]);
  });

  it("is all upcoming before execution starts", () => {
    expect(statuses(null)).toEqual([
      "upcoming",
      "upcoming",
      "upcoming",
      "upcoming",
    ]);
  });

  it("marks a pending phase active and earlier ones done", () => {
    expect(statuses("L1_TIMELOCK_PENDING")).toEqual([
      "active",
      "upcoming",
      "upcoming",
      "upcoming",
    ]);
    expect(statuses("L2_RETRYABLE_PENDING")).toEqual([
      "completed",
      "completed",
      "active",
      "upcoming",
    ]);
  });

  it("marks a reached milestone done", () => {
    expect(statuses("L1_TIMELOCK_EXECUTED")).toEqual([
      "completed",
      "completed",
      "upcoming",
      "upcoming",
    ]);
    expect(statuses("FULLY_EXECUTED")).toEqual([
      "completed",
      "completed",
      "completed",
      "completed",
    ]);
  });

  it("marks the phase a cancellation stopped at", () => {
    expect(statuses("L1_TIMELOCK_PENDING", true)).toEqual([
      "cancelled",
      "upcoming",
      "upcoming",
      "upcoming",
    ]);
  });

  it("treats a phase this governor never reaches as not started", () => {
    expect(statuses("L2_TIMELOCK_PENDING")).toEqual([
      "upcoming",
      "upcoming",
      "upcoming",
      "upcoming",
    ]);
  });
});
