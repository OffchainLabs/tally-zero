import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  IndexerProposalStage,
  IndexerProposalStages,
} from "@/lib/tally-data/types";

import {
  getStagesSource,
  hasPendingIndexerStage,
  indexerStageEstimatedCompletion,
  indexerTimelockExecution,
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
const SCHEDULE_TX = `0x${"ef".repeat(32)}`;
const OPERATION_ID = `0x${"11".repeat(32)}`;
const SALT = `0x${"22".repeat(32)}`;
const PREDECESSOR = `0x${"33".repeat(32)}`;
const TIMELOCK = "0x0000000000000000000000000000000000000Ae1";
const TICKET = `0x${"44".repeat(32)}`;
const E18 = BigInt(10) ** BigInt(18);

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

describe("stage details from the extended endpoint", () => {
  beforeEach(() => {
    for (const key of Object.keys(mocks.env)) delete mocks.env[key];
  });

  it("gives the voting stage gov-tracker's tallies and quorum", () => {
    const mapped = mapIndexerStage(
      stage({
        type: "VOTING_ACTIVE",
        status: "COMPLETED",
        chain: "arb1",
        txHash: TX,
        detail: {
          result: "SUCCEEDED",
          startBlock: "100",
          endBlock: "200",
          forVotes: (BigInt(90) * E18).toString(),
          againstVotes: (BigInt(5) * E18).toString(),
          abstainVotes: (BigInt(15) * E18).toString(),
          quorum: (BigInt(100) * E18).toString(),
        },
      }),
      NOW
    );
    expect(mapped.data).toMatchObject({
      forVotesRaw: (BigInt(90) * E18).toString(),
      againstVotesRaw: (BigInt(5) * E18).toString(),
      abstainVotesRaw: (BigInt(15) * E18).toString(),
      quorumRaw: (BigInt(100) * E18).toString(),
      // For and Abstain count toward quorum: 105 of 100
      quorumReached: true,
      startBlock: "100",
      deadline: "200",
      proposalState: "SUCCEEDED",
    });
  });

  it("leaves quorum unreached below it, and old tallies-free voting stages alone", () => {
    const below = mapIndexerStage(
      stage({
        type: "VOTING_ACTIVE",
        detail: {
          forVotes: "10",
          againstVotes: null,
          abstainVotes: null,
          quorum: "100",
        },
      }),
      NOW
    );
    expect(below.data).toMatchObject({
      quorumReached: false,
      againstVotesRaw: "0",
    });

    const old = mapIndexerStage(
      stage({
        type: "VOTING_ACTIVE",
        status: "COMPLETED",
        txHash: TX,
        detail: { result: "SUCCEEDED", snapshotLocked: true },
      }),
      NOW
    );
    expect(old.data).toEqual({});
  });

  it("lists a completed timelock's schedule and execute transactions", () => {
    const mapped = mapIndexerStage(
      stage({
        type: "L2_TIMELOCK",
        status: "COMPLETED",
        chain: "arb1",
        startedAt: NOW - 100,
        completedAt: NOW - 10,
        txHash: TX,
        detail: {
          operationId: OPERATION_ID,
          calls: 2,
          scheduledTxHash: SCHEDULE_TX,
          salt: SALT,
          predecessor: PREDECESSOR,
          timelockAddress: TIMELOCK,
          chainId: 42161,
        },
      }),
      NOW
    );
    expect(mapped.transactions).toEqual([
      expect.objectContaining({
        hash: SCHEDULE_TX,
        description: "scheduled",
        timestamp: NOW - 100,
      }),
      expect.objectContaining({
        hash: TX,
        description: "executed",
        timestamp: NOW - 10,
      }),
    ]);
    expect(mapped.data).toMatchObject({
      operationId: OPERATION_ID,
      timelockAddress: TIMELOCK,
      salt: SALT,
      predecessor: PREDECESSOR,
      isBatchOperation: true,
    });
  });

  it("lists a pending timelock's schedule transaction once", () => {
    const mapped = mapIndexerStage(
      stage({
        txHash: SCHEDULE_TX,
        detail: { operationId: OPERATION_ID, scheduledTxHash: SCHEDULE_TX },
      }),
      NOW
    );
    expect(mapped.transactions).toEqual([
      expect.objectContaining({ hash: SCHEDULE_TX, description: "scheduled" }),
    ]);
  });

  it("puts a timelock on the chain the indexer names", () => {
    const mapped = mapIndexerStage(
      stage({
        chain: "ethereum",
        detail: { operationId: OPERATION_ID, chainId: 1337 },
      }),
      NOW
    );
    expect(mapped.chainId).toBe(1337);
  });

  it("carries L2-to-L1 messages and their sending transactions", () => {
    const message = {
      position: "7",
      l2TxHash: LEG_TX,
      caller: TIMELOCK,
      destination: "0x0000000000000000000000000000000000000001",
      arbBlockNum: "500",
      ethBlockNum: "400",
      timestamp: String(NOW - 30),
      callvalue: "0",
      data: "0x",
    };
    const mapped = mapIndexerStage(
      stage({
        type: "L2_TO_L1_MESSAGE",
        chain: "ethereum",
        detail: { l1OperationId: OPERATION_ID, messages: [message] },
      }),
      NOW
    );
    expect(mapped.data).toMatchObject({
      messageCount: 1,
      messagePositions: ["7"],
      l2TxHash: LEG_TX,
      l2ToL1Messages: [message],
    });
    expect(mapped.transactions).toEqual([
      expect.objectContaining({
        hash: LEG_TX,
        chainId: 42161,
        description: "message sent",
        timestamp: NOW - 30,
      }),
    ]);
  });

  it("gives each own retryable leg its status and ticket id", () => {
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
              ticketId: `0x${"55".repeat(32)}`,
              status: "REDEEMED",
            },
            {
              executionKey: "0x2",
              executed: false,
              txHash: null,
              ticketId: TICKET,
              status: "REDEEMABLE",
            },
            {
              executionKey: null,
              foreign: true,
              executed: false,
              txHash: null,
              ticketId: null,
              status: "FOREIGN",
            },
          ],
        },
      }),
      NOW
    );
    expect(mapped.data).toEqual({
      ticketCount: 2,
      redemptionDetails: [
        expect.objectContaining({
          index: 0,
          status: "REDEEMED",
          l2TxHash: LEG_TX,
          targetChainId: 42161,
        }),
        expect.objectContaining({
          index: 1,
          status: "REDEEMABLE",
          l2TxHash: null,
          ticketId: TICKET,
        }),
      ],
    });
  });

  it("carries the voting extension to the Extended badge", () => {
    const voting = (wasExtended?: boolean | null) =>
      mapIndexerStage(
        stage({
          type: "VOTING_ACTIVE",
          status: "COMPLETED",
          chain: "arb1",
          txHash: TX,
          detail: { forVotes: "1", quorum: "1", wasExtended },
        }),
        NOW
      ).data as Record<string, unknown>;
    expect(voting(true).wasExtended).toBe(true);
    expect(voting(false).wasExtended).toBe(false);
    expect(voting(null)).not.toHaveProperty("wasExtended");
    expect(voting()).not.toHaveProperty("wasExtended");
  });

  it("gives each leg its L1 creation transaction", () => {
    const CREATION_TX = `0x${"77".repeat(32)}`;
    const legs = () =>
      (
        mapIndexerStage(
          stage({
            type: "RETRYABLE_EXECUTED",
            chain: "arb1",
            detail: {
              legs: [
                {
                  executionKey: "0x1",
                  executed: false,
                  txHash: null,
                  ticketId: TICKET,
                  status: "REDEEMABLE",
                  creationTxHash: CREATION_TX,
                },
                {
                  executionKey: "0x2",
                  executed: false,
                  txHash: null,
                  status: "PENDING",
                },
              ],
            },
          }),
          NOW
        ).data as unknown as { redemptionDetails: Record<string, unknown>[] }
      ).redemptionDetails;

    expect(legs()[0]).toMatchObject({
      creationTxHash: CREATION_TX,
      creationChain: "ethereum",
    });
    expect(legs()[1].creationTxHash).toBeNull();

    // The local L1 has no explorer
    mocks.env.NEXT_PUBLIC_LOCAL_CHAINS = "1";
    expect(legs()[0].creationChain).toBe("unknown");
  });

  it("maps election stages with a summary of their detail", () => {
    const nominee = mapIndexerStage(
      stage({
        type: "NOMINEE_ELECTION",
        chain: "arb1",
        txHash: TX,
        detail: { cohort: 1, startBlock: "10", endBlock: "20" },
      }),
      NOW
    );
    expect(nominee.type).toBe("NOMINEE_ELECTION");
    expect(nominee.data).toEqual({
      note: "Cohort 1, Nominee voting blocks 10 to 20",
    });

    const vetting = mapIndexerStage(
      stage({
        type: "NOMINEE_VETTING",
        chain: "arb1",
        txHash: TX,
        detail: { cohort: 0, vettingEndBlock: "30" },
      }),
      NOW
    );
    expect(vetting.data).toEqual({
      note: "Cohort 0, Vetting ends at block 30",
    });

    const member = mapIndexerStage(
      stage({
        type: "MEMBER_ELECTION",
        chain: "arb1",
        txHash: TX,
        detail: {
          cohort: 0,
          memberProposalId: "9",
          memberStartBlock: "40",
          memberEndBlock: "50",
        },
      }),
      NOW
    );
    expect(member.data).toEqual({
      note: "Cohort 0, Member voting blocks 40 to 50",
    });
  });
});

describe("indexerTimelockExecution", () => {
  beforeEach(() => {
    for (const key of Object.keys(mocks.env)) delete mocks.env[key];
  });

  const call = {
    target: "0x0000000000000000000000000000000000000001",
    value: "0",
    data: "0x1234",
  };
  const ready = stage({
    type: "L2_TIMELOCK",
    chain: "arb1",
    etaAt: NOW - 1,
    detail: {
      operationId: OPERATION_ID,
      calls: 1,
      salt: SALT,
      predecessor: PREDECESSOR,
      timelockAddress: TIMELOCK,
      chainId: 42161,
      operations: [call],
    },
  });

  it("returns the inputs of a pending timelock past its ETA", () => {
    expect(indexerTimelockExecution(ready, NOW)).toEqual({
      operationId: OPERATION_ID,
      timelockAddress: TIMELOCK,
      chainId: 42161,
      calls: [call],
      predecessor: PREDECESSOR,
      salt: SALT,
    });
  });

  it("runs an L1 timelock on the L1 voting chain when the indexer names none", () => {
    mocks.env.NEXT_PUBLIC_LOCAL_CHAINS = "1";
    const l1 = indexerTimelockExecution(
      {
        ...ready,
        type: "L1_TIMELOCK",
        chain: "ethereum",
        detail: { ...ready.detail!, chainId: null, predecessor: null },
      },
      NOW
    );
    expect(l1?.chainId).toBe(1337);
    expect(l1?.predecessor).toBe(`0x${"0".repeat(64)}`);
  });

  it("returns null before the ETA, once done, without a salt, or without calls", () => {
    expect(indexerTimelockExecution(ready, NOW - 2)).toBeNull();
    expect(
      indexerTimelockExecution({ ...ready, status: "COMPLETED" }, NOW)
    ).toBeNull();
    expect(
      indexerTimelockExecution(
        { ...ready, detail: { ...ready.detail!, salt: null } },
        NOW
      )
    ).toBeNull();
    expect(
      indexerTimelockExecution(
        { ...ready, detail: { ...ready.detail!, operations: undefined } },
        NOW
      )
    ).toBeNull();
    expect(
      indexerTimelockExecution({ ...ready, type: "PROPOSAL_QUEUED" }, NOW)
    ).toBeNull();
  });
});
