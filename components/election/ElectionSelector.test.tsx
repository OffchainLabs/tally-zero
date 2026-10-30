import { describe, expect, it } from "vitest";

import type {
  ElectionProposalStatus,
  TrackedStage,
} from "@gzeoneth/gov-tracker";

import { getElectionCreationTx } from "./ElectionSelector";

/** Sep 15 2023: when election #1 actually ran. */
const SEP_15_2023 = Math.floor(Date.UTC(2023, 8, 15, 12) / 1000);

function createStage(transactions: TrackedStage["transactions"]): TrackedStage {
  return {
    type: "CREATE_ELECTION",
    status: "DONE",
    chain: "arb1",
    chainId: 42161,
    transactions,
    data: {},
  } as unknown as TrackedStage;
}

function election(stages?: TrackedStage[]): ElectionProposalStatus {
  return {
    electionIndex: 0,
    phase: "COMPLETED",
    cohort: 0,
    stages,
  } as unknown as ElectionProposalStatus;
}

describe("getElectionCreationTx", () => {
  it("returns the transaction that created the election", () => {
    const tx = getElectionCreationTx(
      election([
        createStage([
          {
            hash: "0xcreate",
            blockNumber: 123,
            timestamp: SEP_15_2023,
            chain: "arb1",
            chainId: 42161,
          },
        ]),
      ])
    );

    expect(tx?.timestamp).toBe(SEP_15_2023);
  });

  it("keeps the block number when the tracker recorded no timestamp", () => {
    const tx = getElectionCreationTx(
      election([
        createStage([
          {
            hash: "0xcreate",
            blockNumber: 123,
            chain: "arb1",
            chainId: 42161,
          },
        ]),
      ])
    );

    expect(tx?.timestamp).toBeUndefined();
    expect(tx?.blockNumber).toBe(123);
  });

  it("returns null rather than a date from another stage", () => {
    const memberElectionStage = {
      ...createStage([
        {
          hash: "0xmember",
          blockNumber: 456,
          timestamp: SEP_15_2023,
          chain: "arb1",
          chainId: 42161,
        },
      ]),
      type: "MEMBER_ELECTION",
    } as unknown as TrackedStage;

    expect(getElectionCreationTx(election([memberElectionStage]))).toBeNull();
  });

  it("returns null when stages have not loaded", () => {
    expect(getElectionCreationTx(election(undefined))).toBeNull();
    expect(getElectionCreationTx(election([]))).toBeNull();
  });
});
