import { describe, expect, it } from "vitest";

import {
  estimateL1BlockDate,
  getL1VotingDeadline,
  l1BlockTimeSeconds,
  l1ProposalView,
  resolveL1ProposalState,
  snapshotLockExplanation,
} from "./l1-proposal";

const NOW = Date.UTC(2026, 9, 21, 12, 0, 0);

describe("L1 proposal timing", () => {
  it("uses 12s blocks on Ethereum and 1s on the local L1", () => {
    expect(l1BlockTimeSeconds(1)).toBe(12);
    expect(l1BlockTimeSeconds(1337)).toBe(1);
  });

  it("extrapolates a block's time from the head", () => {
    expect(estimateL1BlockDate(1_100, 1_000, 1, NOW).getTime()).toBe(
      NOW + 100 * 12_000
    );
    expect(estimateL1BlockDate(1_100, 1_000, 1337, NOW).getTime()).toBe(
      NOW + 100 * 1_000
    );
    expect(estimateL1BlockDate(900, 1_000, 1, NOW).getTime()).toBe(
      NOW - 100 * 12_000
    );
  });

  it("counts blocks to the deadline and notices when it has passed", () => {
    expect(getL1VotingDeadline(1_300, 1_000, 1, NOW)).toEqual({
      deadlineBlock: 1_300,
      blocksRemaining: 300,
      estimatedAt: new Date(NOW + 300 * 12_000),
      hasEnded: false,
    });

    const ended = getL1VotingDeadline(1_000, 1_001, 1, NOW);
    expect(ended.blocksRemaining).toBe(0);
    expect(ended.hasEnded).toBe(true);
  });
});

describe("snapshotLockExplanation", () => {
  it("explains the week-old voting power on mainnet", () => {
    expect(snapshotLockExplanation(1)).toMatch(/confirmed assertion/);
    expect(snapshotLockExplanation(1)).toMatch(/about a week earlier/);
  });

  it("says assertions confirm quickly on the local testnode", () => {
    expect(snapshotLockExplanation(1337)).toMatch(/local testnode/);
  });
});

describe("resolveL1ProposalState", () => {
  it("prefers the governor's read over the indexer", () => {
    // 1 = Active in OpenZeppelin's ProposalState
    expect(resolveL1ProposalState(1, "Pending")).toBe("Active");
  });

  it("falls back to the indexed state until the read arrives", () => {
    expect(resolveL1ProposalState(undefined, "Queued")).toBe("Queued");
    expect(resolveL1ProposalState(undefined, null)).toBe("Unknown");
  });
});

describe("l1ProposalView", () => {
  const entry = {
    state: "Active",
    executionPhase: null,
    executionCancelled: false,
    description: "# Recover the bridge",
    snapshotBlock: 120,
    snapshotLocked: true,
    quorum: "100",
  };
  const verified = {
    description: "# Recover the bridge",
    startBlock: BigInt(110),
  };
  const view = (over: Partial<Parameters<typeof l1ProposalView>[0]> = {}) =>
    l1ProposalView({
      proposalId: "7",
      entry,
      onChain: { state: 1 },
      verified,
      verifyError: null,
      ...over,
    });

  it("is verified, and lets the vote through, when Ethereum agrees with the indexer", () => {
    expect(view()).toMatchObject({
      verified: true,
      mismatch: false,
      fromChainOnly: false,
      voteBlocked: null,
      quorum: "100",
    });
  });

  it("shows Ethereum's text and blocks the vote when the indexer's differs", () => {
    const v = view({
      entry: { ...entry, description: "# Harmless housekeeping" },
    })!;
    expect(v.description).toBe("# Recover the bridge");
    expect(v).toMatchObject({ verified: false, mismatch: true });
    expect(v.voteBlocked).toMatch(/differs/);
  });

  it("stands on Ethereum alone when the indexer is unreachable", () => {
    expect(view({ entry: null })).toMatchObject({
      fromChainOnly: true,
      verified: true,
      description: "# Recover the bridge",
      snapshotBlock: 110,
      quorum: null,
      voteBlocked: null,
    });
  });

  it("blocks the vote until the proposal is confirmed, and says why when it can't be", () => {
    expect(view({ verified: undefined })!.voteBlocked).toMatch(/Checking/);
    expect(
      view({ verified: undefined, verifyError: "no ProposalCreated event" })!
        .voteBlocked
    ).toMatch(/Could not confirm .*(no ProposalCreated event)/);
  });

  it("is nothing when neither source knows the proposal", () => {
    expect(view({ entry: null, verified: undefined })).toBeNull();
  });
});
