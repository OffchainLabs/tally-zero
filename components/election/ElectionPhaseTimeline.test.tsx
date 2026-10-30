import { describe, expect, it } from "vitest";

import type { TrackedStage } from "@gzeoneth/gov-tracker";

import { getElectionStartFromStages } from "./ElectionPhaseTimeline";

/** Mar 15 2026: when election #6 was created. */
const MAR_15_2026 = Math.floor(Date.UTC(2026, 2, 15, 12) / 1000);

const CREATE_TX_HASH = "0xcreate";

function createStage(
  transactions: TrackedStage["transactions"],
  type: TrackedStage["type"] = "CREATE_ELECTION"
): TrackedStage {
  return {
    type,
    status: "COMPLETED",
    chain: "arb1",
    chainId: 42161,
    transactions,
    data: {},
  } as unknown as TrackedStage;
}

function createTx(timestamp?: number): TrackedStage["transactions"][number] {
  return {
    hash: CREATE_TX_HASH,
    blockNumber: 442040361,
    ...(timestamp !== undefined && { timestamp }),
    chain: "arb1",
    chainId: 42161,
  } as unknown as TrackedStage["transactions"][number];
}

describe("getElectionStartFromStages", () => {
  it("uses the creation transaction's own timestamp when it has one", () => {
    expect(
      getElectionStartFromStages([createStage([createTx(MAR_15_2026)])])
    ).toBe(MAR_15_2026);
  });

  // The tracker records the CREATE_ELECTION transaction with a block number and
  // no timestamp, so this is the case every real election takes.
  it("falls back to the timestamp resolved for the creation block", () => {
    expect(
      getElectionStartFromStages(
        [createStage([createTx()])],
        new Map([[CREATE_TX_HASH, MAR_15_2026]])
      )
    ).toBe(MAR_15_2026);
  });

  it("returns null while the creation block is still unresolved", () => {
    expect(getElectionStartFromStages([createStage([createTx()])])).toBeNull();
    expect(
      getElectionStartFromStages([createStage([createTx()])], new Map())
    ).toBeNull();
  });

  it("does not take a date from another stage's transaction", () => {
    expect(
      getElectionStartFromStages(
        [createStage([createTx()], "MEMBER_ELECTION")],
        new Map([[CREATE_TX_HASH, MAR_15_2026]])
      )
    ).toBeNull();
  });

  it("returns null when stages have not loaded", () => {
    expect(getElectionStartFromStages(undefined)).toBeNull();
    expect(getElectionStartFromStages([])).toBeNull();
    expect(getElectionStartFromStages([createStage([])])).toBeNull();
  });
});
