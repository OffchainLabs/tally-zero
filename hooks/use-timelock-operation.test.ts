import { describe, expect, it } from "vitest";

import type { TrackedStage, TrackingCheckpoint } from "@gzeoneth/gov-tracker";

import { buildOperationFromCheckpoint } from "./use-timelock-operation";

// `SerializedCallScheduledData` lives inside gov-tracker but isn't re-exported,
// so we mirror just the JSON-shape fields the consumer actually reads.
type SerializedCallScheduledShape = {
  operationId: string;
  index: string;
  target: string;
  value: string;
  data: string;
  predecessor: string;
  delay: string;
  blockNumber: number;
  txHash: string;
  logIndex: number;
  timelockAddress: string;
};

function scheduledData(
  overrides: Partial<SerializedCallScheduledShape> = {}
): SerializedCallScheduledShape {
  return {
    operationId: "0xOpId",
    index: "0",
    target: "0xTarget",
    value: "0",
    data: "0xcalldata",
    predecessor:
      "0x0000000000000000000000000000000000000000000000000000000000000000",
    delay: "259200",
    blockNumber: 12_345,
    txHash: "0xScheduleTx",
    logIndex: 0,
    timelockAddress: "0xTimelock",
    ...overrides,
  };
}

function l2TimelockStage(
  data: SerializedCallScheduledShape,
  txOverrides: Partial<TrackedStage["transactions"][number]> = {}
): TrackedStage {
  return {
    type: "L2_TIMELOCK",
    status: "COMPLETED",
    chain: "arb1",
    chainId: 42161,
    transactions: [
      {
        hash: data.txHash,
        blockNumber: data.blockNumber,
        chain: "arb1",
        chainId: 42161,
        logIndex: 0,
        description: "scheduled",
        timestamp: 1_700_000_000,
        ...txOverrides,
      },
    ],
    data: {
      callScheduledData: [data],
    },
  } as TrackedStage;
}

function checkpoint(
  overrides: Partial<TrackingCheckpoint> = {},
  stages: TrackedStage[] = []
): TrackingCheckpoint {
  return {
    version: 1,
    createdAt: 1_700_000_000_000,
    input: {
      type: "timelock",
      timelockAddress: "0xTimelock",
      operationId: "0xOpId",
      scheduledTxHash: "0xScheduleTx",
    },
    lastProcessedStage: "L2_TIMELOCK",
    lastProcessedBlock: { l1: 0, l2: 12_345 },
    cachedData: {
      completedStages: stages,
    },
    metadata: {
      errorCount: 0,
      lastTrackedAt: 1_700_000_000_000,
    },
    ...overrides,
  };
}

describe("buildOperationFromCheckpoint", () => {
  it("returns null for non-timelock checkpoints", () => {
    const cp = checkpoint({
      input: {
        type: "governor",
        governorAddress: "0xGov",
        proposalId: "1",
        creationTxHash: "0xCreation",
      },
    });
    expect(buildOperationFromCheckpoint(cp, "0xRequested")).toBeNull();
  });

  it("returns null when there is no L2_TIMELOCK stage and no input timelockAddress", () => {
    const cp = checkpoint(
      {
        input: {
          type: "timelock",
          // empty timelockAddress means we have no anchor for the operation
          timelockAddress: "",
          operationId: "0xOpId",
          scheduledTxHash: "0xScheduleTx",
        },
      },
      []
    );
    expect(buildOperationFromCheckpoint(cp, "0xRequested")).toBeNull();
  });

  it("returns a populated CachedTimelockOperation for a valid checkpoint", () => {
    const cp = checkpoint({}, [l2TimelockStage(scheduledData())]);
    const result = buildOperationFromCheckpoint(cp, "0xRequested");

    expect(result).not.toBeNull();
    expect(result?.operation.operationId).toBe("0xOpId");
    expect(result?.operation.target).toBe("0xTarget");
    expect(result?.operation.delay).toBe("259200");
    expect(result?.operation.txHash).toBe("0xScheduleTx");
    expect(result?.operation.blockNumber).toBe(12_345);
    expect(result?.operation.timestamp).toBe(1_700_000_000);
    expect(result?.operation.timelockAddress).toBe("0xTimelock");
  });

  it("drops the cached entry when scheduledData lacks `target`", () => {
    const cp = checkpoint({}, [l2TimelockStage(scheduledData({ target: "" }))]);
    expect(buildOperationFromCheckpoint(cp, "0xRequested")).toBeNull();
  });

  it("drops the cached entry when scheduledData lacks `delay`", () => {
    const cp = checkpoint({}, [
      l2TimelockStage(
        scheduledData({
          delay: undefined as unknown as string,
        })
      ),
    ]);
    expect(buildOperationFromCheckpoint(cp, "0xRequested")).toBeNull();
  });

  it("drops the cached entry when scheduledData is missing entirely", () => {
    // Stage exists but its data.callScheduledData is not an array
    const stage = {
      type: "L2_TIMELOCK",
      status: "COMPLETED",
      chain: "arb1",
      chainId: 42161,
      transactions: [
        {
          hash: "0xScheduleTx",
          blockNumber: 12_345,
          chain: "arb1",
          chainId: 42161,
          logIndex: 0,
          description: "scheduled",
        },
      ],
      data: {},
    } as unknown as TrackedStage;
    const cp = checkpoint({}, [stage]);
    expect(buildOperationFromCheckpoint(cp, "0xRequested")).toBeNull();
  });

  it("matches scheduledData by operationId case-insensitively", () => {
    const cp = checkpoint(
      {
        input: {
          type: "timelock",
          timelockAddress: "0xTimelock",
          // Upper-case operation id in the checkpoint input.
          operationId: "0xABCDEF",
          scheduledTxHash: "0xScheduleTx",
        },
      },
      [l2TimelockStage(scheduledData({ operationId: "0xabcdef" }))]
    );
    const result = buildOperationFromCheckpoint(cp, "0xRequested");
    expect(result?.operation.operationId).toBe("0xABCDEF");
    expect(result?.operation.target).toBe("0xTarget");
  });

  it("falls back to the requested txHash when no scheduled tx hash is recorded", () => {
    const cp = checkpoint(
      {
        input: {
          type: "timelock",
          timelockAddress: "0xTimelock",
          operationId: "0xOpId",
          scheduledTxHash: undefined as unknown as string,
        },
      },
      [
        l2TimelockStage(
          scheduledData({ txHash: undefined as unknown as string })
        ),
      ]
    );
    const result = buildOperationFromCheckpoint(cp, "0xRequested");
    expect(result?.operation.txHash).toBe("0xRequested");
  });
});
