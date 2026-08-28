import { describe, expect, it } from "vitest";

import { GOVERNORS } from "@/config/governors";
import { LIFECYCLE_WINDOW_DAYS } from "@/lib/proposal-utils";
import { BLOCKS_PER_DAY } from "@config/block-times";

import { shouldTrackProposalLifecycle } from "./use-proposal-lifecycle-status";

const CREATION_TX =
  "0x1f709032574f9c3986dbda8767f3bb9ff4f9c48cb67529f390dd9fa9b3bf853d";

/** L1 head and the snapshot of proposal 9950…, 28.7 days of L2 blocks back */
const L1_HEAD = 25_900_000;
const RECENT_SNAPSHOT = 25_646_648;
const OLD_SNAPSHOT =
  L1_HEAD - (LIFECYCLE_WINDOW_DAYS + 1) * BLOCKS_PER_DAY.ethereum;

function proposal(overrides: Record<string, unknown> = {}) {
  return {
    id: "9950",
    state: "Executed",
    contractAddress: GOVERNORS.core.address,
    creationTxHash: CREATION_TX,
    startBlock: String(RECENT_SNAPSHOT),
    ...overrides,
  };
}

describe("shouldTrackProposalLifecycle", () => {
  // The governor answers Executed the moment the L2 timelock operation runs,
  // which is where the L2 -> L1 -> retryable round trip starts. This is the one
  // case where the stages know something state() does not.
  it("tracks a recent Core proposal the governor already calls Executed", () => {
    expect(shouldTrackProposalLifecycle(proposal(), L1_HEAD)).toBe(true);
  });

  // Reading creation transactions from the indexer made every row traceable.
  // Tracing every traceable row put six of the first ten behind a
  // two-at-a-time queue, ~24s for the last, all to confirm what was on screen.
  it("does not trace a status the governor already settles", () => {
    for (const state of [
      "Pending",
      "Active",
      "Succeeded",
      "Queued",
      "Defeated",
      "Canceled",
      "Expired",
    ]) {
      expect(shouldTrackProposalLifecycle(proposal({ state }), L1_HEAD)).toBe(
        false
      );
    }
  });

  it("does not trace a Core proposal that finished long ago", () => {
    expect(
      shouldTrackProposalLifecycle(
        proposal({ startBlock: String(OLD_SNAPSHOT) }),
        L1_HEAD
      )
    ).toBe(false);
  });

  it("leaves a Treasury Executed proposal alone: it never left L2", () => {
    expect(
      shouldTrackProposalLifecycle(
        proposal({ contractAddress: GOVERNORS.treasury.address }),
        L1_HEAD
      )
    ).toBe(false);
  });

  // Without the governor clock the window cannot be evaluated. Tracing resumes
  // when it arrives, rather than tracing everything in the meantime.
  it("waits for the governor clock", () => {
    expect(shouldTrackProposalLifecycle(proposal(), null)).toBe(false);
  });

  it("cannot track a proposal with no creation transaction", () => {
    expect(
      shouldTrackProposalLifecycle(proposal({ creationTxHash: "" }), L1_HEAD)
    ).toBe(false);
  });
});
