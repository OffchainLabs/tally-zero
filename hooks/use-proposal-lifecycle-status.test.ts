import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GOVERNORS } from "@/config/governors";
import { LIFECYCLE_WINDOW_DAYS } from "@/lib/proposal-utils";
import { BLOCKS_PER_DAY } from "@config/block-times";

import {
  shouldTrackProposalLifecycle,
  useProposalLifecycleStatus,
  type ProposalLifecycleInput,
} from "./use-proposal-lifecycle-status";

const mocks = vi.hoisted(() => ({
  useL1Block: vi.fn(),
  useProposalStages: vi.fn(),
}));

vi.mock("@/hooks/use-l1-block", () => ({ useL1Block: mocks.useL1Block }));
vi.mock("@/hooks/use-proposal-stages", () => ({
  useProposalStages: mocks.useProposalStages,
}));

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

describe("useProposalLifecycleStatus", () => {
  const UNREGISTERED_L1_GOVERNOR = "0x4444444444444444444444444444444444444444";

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useL1Block.mockReturnValue({
      currentL1Block: L1_HEAD,
      isLoading: false,
    });
    mocks.useProposalStages.mockReturnValue({
      stages: [],
      currentStageIndex: -1,
      isLoading: false,
      isQueued: false,
      queuePosition: null,
      isComplete: false,
      error: null,
      result: null,
      isBackgroundRefreshing: false,
    });
  });

  function render(input: ProposalLifecycleInput) {
    function Probe() {
      useProposalLifecycleStatus(input);
      return null;
    }
    renderToStaticMarkup(createElement(Probe));
  }

  // The registry only learns an L1 voting governor once the proposal list has
  // loaded, so the row's own fields decide which stages the trace looks for.
  it("tracks an L1 voting row as L1 before the registry knows its governor", () => {
    render(
      proposal({
        contractAddress: UNREGISTERED_L1_GOVERNOR,
        networkId: "1",
        governorType: "L1_VOTING",
      })
    );

    expect(mocks.useProposalStages).toHaveBeenCalledWith(
      expect.objectContaining({ isL1Voting: true })
    );
  });

  it("tracks an Arbitrum row as not L1", () => {
    render(proposal({ networkId: "42161", governorType: "CONSTITUTIONAL" }));

    expect(mocks.useProposalStages).toHaveBeenCalledWith(
      expect.objectContaining({ isL1Voting: false })
    );
  });
});
