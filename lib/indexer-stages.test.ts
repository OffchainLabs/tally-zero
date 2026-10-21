import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  IndexerProposalStage,
  IndexerProposalStages,
} from "@/lib/tally-data/types";

import {
  getStagesSource,
  hasPendingIndexerStage,
  indexerStageEstimatedCompletion,
  mapIndexerStage,
  mapIndexerStages,
  usesIndexerStages,
} from "./indexer-stages";

const mocks = vi.hoisted(() => ({
  env: {} as Record<string, string | undefined>,
}));

vi.mock("@/env", () => ({ env: mocks.env }));

const TX = `0x${"ab".repeat(32)}`;
const LEG_TX = `0x${"cd".repeat(32)}`;
const NOW = 1_800_000_000;

function stage(overrides: Partial<IndexerProposalStage>): IndexerProposalStage {
  return {
    type: "L1_TIMELOCK",
    status: "PENDING",
    chain: "ethereum",
    startedAt: null,
    completedAt: null,
    etaAt: null,
    txHash: null,
    detail: null,
    ...overrides,
  };
}

describe("indexer stages source", () => {
  beforeEach(() => {
    for (const key of Object.keys(mocks.env)) delete mocks.env[key];
  });

  it("defaults to gov-tracker", () => {
    expect(getStagesSource()).toBe("gov-tracker");
    expect(usesIndexerStages({ governorType: "CONSTITUTIONAL" })).toBe(false);
  });

  it("always uses the indexer for L1 voting proposals", () => {
    expect(usesIndexerStages({ governorType: "L1_VOTING" })).toBe(true);
    expect(usesIndexerStages({ networkId: "1337" })).toBe(true);
  });

  it("uses the indexer for every proposal under the flag", () => {
    mocks.env.NEXT_PUBLIC_STAGES_SOURCE = "indexer";
    expect(getStagesSource()).toBe("indexer");
    expect(usesIndexerStages({ governorType: "NON_CONSTITUTIONAL" })).toBe(
      true
    );
  });
});

describe("mapIndexerStage", () => {
  beforeEach(() => {
    for (const key of Object.keys(mocks.env)) delete mocks.env[key];
  });

  it("maps a completed stage with its transaction on the explorer chain", () => {
    const mapped = mapIndexerStage(
      stage({
        type: "PROPOSAL_QUEUED",
        status: "COMPLETED",
        chain: "arb1",
        startedAt: NOW - 100,
        completedAt: NOW - 50,
        txHash: TX,
      }),
      NOW
    );

    expect(mapped).toMatchObject({
      type: "PROPOSAL_QUEUED",
      status: "COMPLETED",
      chain: "arb1",
      chainId: 42161,
      executable: false,
      timing: { startedAt: NOW - 100 },
      transactions: [
        { hash: TX, chain: "arb1", chainId: 42161, timestamp: NOW - 50 },
      ],
      data: {},
    });
  });

  it("marks a pending timelock past its ETA as READY and executable", () => {
    const ready = mapIndexerStage(stage({ etaAt: NOW - 1 }), NOW);
    expect(ready.status).toBe("READY");
    expect(ready.executable).toBe(true);
    expect(ready.timing?.eta).toBe(NOW - 1);

    const waiting = mapIndexerStage(stage({ etaAt: NOW + 60 }), NOW);
    expect(waiting.status).toBe("PENDING");
    expect(waiting.executable).toBe(false);
  });

  it("keeps CANCELED and NOT_STARTED as they are", () => {
    expect(mapIndexerStage(stage({ status: "CANCELED" }), NOW).status).toBe(
      "CANCELED"
    );
    expect(
      mapIndexerStage(stage({ status: "NOT_STARTED", etaAt: NOW - 1 }), NOW)
        .status
    ).toBe("NOT_STARTED");
  });

  it("turns retryable legs into Arbitrum transactions and a count", () => {
    const mapped = mapIndexerStage(
      stage({
        type: "RETRYABLE_EXECUTED",
        chain: "arb1",
        detail: {
          legs: [
            {
              executionKey: "0x1",
              executed: true,
              executedAt: NOW - 5,
              txHash: LEG_TX,
            },
            { executionKey: "0x2", executed: false, txHash: null },
            {
              executionKey: null,
              foreign: true,
              executed: false,
              txHash: null,
            },
          ],
        },
      }),
      NOW
    );

    expect(mapped.transactions).toEqual([
      expect.objectContaining({
        hash: LEG_TX,
        chain: "arb1",
        chainId: 42161,
        timestamp: NOW - 5,
      }),
    ]);
    expect(mapped.data).toEqual({
      note: "Retryable tickets executed: 1/2",
    });
  });

  it("does not list the completing transaction twice", () => {
    const mapped = mapIndexerStage(
      stage({
        type: "RETRYABLE_EXECUTED",
        status: "COMPLETED",
        chain: "arb1",
        txHash: LEG_TX,
        detail: {
          legs: [{ executionKey: "0x1", executed: true, txHash: LEG_TX }],
        },
      }),
      NOW
    );
    expect(mapped.transactions).toHaveLength(1);
  });

  it("dates a stage without a transaction from its own times", () => {
    const started = mapIndexerStage(
      stage({ type: "VOTING_ACTIVE", startedAt: NOW - 10 }),
      NOW
    );
    expect(started.data).toEqual({ note: expect.stringMatching(/^Started /) });

    const completed = mapIndexerStage(
      stage({ status: "COMPLETED", completedAt: NOW - 10 }),
      NOW
    );
    expect(completed.data).toEqual({
      note: expect.stringMatching(/^Completed /),
    });
  });

  it("gives local chains no explorer chain, so hashes render unlinked", () => {
    mocks.env.NEXT_PUBLIC_LOCAL_CHAINS = "1";

    const l1 = mapIndexerStage(stage({ txHash: TX }), NOW);
    expect(l1.chain).toBe("unknown");
    expect(l1.chainId).toBe(1337);
    expect(l1.transactions[0]).toMatchObject({
      chain: "unknown",
      chainId: 1337,
    });

    const l2 = mapIndexerStage(stage({ chain: "arb1", txHash: TX }), NOW);
    expect(l2.chainId).toBe(412346);
    expect(l2.transactions[0].chain).toBe("unknown");
  });
});

describe("stage list helpers", () => {
  const response: IndexerProposalStages = {
    proposalId: "1",
    governorAddress: "0x0000000000000000000000000000000000000001",
    governorType: "L1_VOTING",
    executionPhase: "L1_TIMELOCK_PENDING",
    executionCancelled: false,
    stages: [
      stage({ type: "PROPOSAL_CREATED", status: "COMPLETED", txHash: TX }),
      stage({ type: "L1_TIMELOCK", status: "PENDING", etaAt: NOW + 10 }),
    ],
  };

  it("maps every stage in order", () => {
    expect(mapIndexerStages(response, NOW).map((s) => s.type)).toEqual([
      "PROPOSAL_CREATED",
      "L1_TIMELOCK",
    ]);
  });

  it("polls only while a stage is pending and nothing was cancelled", () => {
    expect(hasPendingIndexerStage(response)).toBe(true);
    expect(
      hasPendingIndexerStage({ ...response, executionCancelled: true })
    ).toBe(false);
    expect(
      hasPendingIndexerStage({
        ...response,
        stages: [response.stages[0]],
      })
    ).toBe(false);
    expect(hasPendingIndexerStage(null)).toBe(false);
  });

  it("estimates completion from an unfinished stage's ETA", () => {
    expect(
      indexerStageEstimatedCompletion(stage({ etaAt: NOW }))?.minDate.getTime()
    ).toBe(NOW * 1000);
    expect(
      indexerStageEstimatedCompletion(
        stage({ status: "COMPLETED", etaAt: NOW })
      )
    ).toBeUndefined();
    expect(indexerStageEstimatedCompletion(stage({}))).toBeUndefined();
  });
});
