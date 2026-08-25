import { describe, expect, it } from "vitest";

import { GOVERNORS } from "@/config/governors";
import { GOVERNOR_VOTING_PERIOD_BLOCKS } from "@config/arbitrum-governance";
import { BLOCKS_PER_DAY } from "@config/block-times";

import {
  getScheduledVoteEndBlock,
  isIncompleteProposalState,
  isProposalStateUnverified,
  LIFECYCLE_WINDOW_DAYS,
  mergeProposalData,
  needsOnChainStateRefresh,
  type StateVerificationProgress,
} from "./proposal-utils";

/**
 * Real numbers for proposal 7191…, the Core Governor proposal whose voting
 * period was extended from 14 to ~15.6 days by a late-quorum extension. Read
 * on-chain 2026-07-31: the indexer reported DEFEATED while `state()` said Active.
 */
const SNAPSHOT_BLOCK = 25_547_165;
const SCHEDULED_END_BLOCK = SNAPSHOT_BLOCK + GOVERNOR_VOTING_PERIOD_BLOCKS;
const L1_HEAD = 25_653_846;
const SEVEN_DAYS_OF_BLOCKS = 7 * BLOCKS_PER_DAY.ethereum;

describe("proposal-utils", () => {
  describe("getScheduledVoteEndBlock", () => {
    it("prefers the proposal's own end block when the RPC path supplied one", () => {
      expect(
        getScheduledVoteEndBlock({
          state: "Defeated",
          startBlock: String(SNAPSHOT_BLOCK),
          endBlock: "25647965",
        })
      ).toBe(25_647_965);
    });

    it("derives the end from the snapshot when the indexer supplied no end block", () => {
      // The indexer index carries snapshotBlock only, and sends endBlock as "0"
      expect(
        getScheduledVoteEndBlock({
          state: "Defeated",
          startBlock: String(SNAPSHOT_BLOCK),
          endBlock: "0",
        })
      ).toBe(SCHEDULED_END_BLOCK);
    });

    it("returns null when neither block is usable", () => {
      expect(
        getScheduledVoteEndBlock({ state: "Defeated", startBlock: "0" })
      ).toBeNull();
      expect(getScheduledVoteEndBlock({ state: "Defeated" })).toBeNull();
    });
  });

  describe("needsOnChainStateRefresh", () => {
    it("always re-reads states that are still in flight", () => {
      for (const state of ["Pending", "active", "Unknown"]) {
        expect(needsOnChainStateRefresh({ state }, L1_HEAD)).toBe(true);
      }
    });

    // queue() and execute() move these on-chain at any moment, and the indexer
    // reports whichever it last saw, which is what makes the newest rows wrong.
    it("re-reads the post-vote states the governor can still advance", () => {
      for (const state of ["Succeeded", "queued", "QUEUED"]) {
        expect(
          needsOnChainStateRefresh(
            { state, startBlock: String(SNAPSHOT_BLOCK) },
            L1_HEAD
          )
        ).toBe(true);
      }
    });

    it("never re-reads the states the governor never leaves", () => {
      for (const state of ["Canceled", "Expired", "EXECUTED"]) {
        expect(
          needsOnChainStateRefresh(
            { state, startBlock: String(SNAPSHOT_BLOCK) },
            L1_HEAD
          )
        ).toBe(false);
      }
    });

    it("re-reads a Defeated proposal whose voting period just ended", () => {
      // The real case: scheduled end ~1 day behind the L1 head, but the
      // late-quorum extension means the governor still answers Active.
      expect(
        needsOnChainStateRefresh(
          {
            state: "DEFEATED",
            startBlock: String(SNAPSHOT_BLOCK),
            endBlock: "0",
          },
          L1_HEAD
        )
      ).toBe(true);
    });

    it("re-reads a Defeated proposal whose voting period has not ended yet", () => {
      expect(
        needsOnChainStateRefresh(
          { state: "Defeated", endBlock: String(L1_HEAD + 1_000) },
          L1_HEAD
        )
      ).toBe(true);
    });

    it("re-reads right up to the 7-day boundary", () => {
      const endBlock = String(L1_HEAD - SEVEN_DAYS_OF_BLOCKS);
      expect(
        needsOnChainStateRefresh({ state: "Defeated", endBlock }, L1_HEAD)
      ).toBe(true);
    });

    it("trusts a Defeated proposal that ended more than 7 days ago", () => {
      const endBlock = String(L1_HEAD - SEVEN_DAYS_OF_BLOCKS - 1);
      expect(
        needsOnChainStateRefresh({ state: "Defeated", endBlock }, L1_HEAD)
      ).toBe(false);
    });

    it("trusts historic defeats, so old rows cost no governor calls", () => {
      expect(
        needsOnChainStateRefresh(
          { state: "Defeated", startBlock: "17000000", endBlock: "0" },
          L1_HEAD
        )
      ).toBe(false);
    });

    it("leaves Defeated alone until the governor clock is known", () => {
      // useL1Block has not resolved yet; the window cannot be evaluated. The
      // check resumes once the L1 head arrives.
      expect(
        needsOnChainStateRefresh(
          { state: "Defeated", startBlock: String(SNAPSHOT_BLOCK) },
          null
        )
      ).toBe(false);
      // In-flight states do not depend on the clock
      expect(needsOnChainStateRefresh({ state: "Active" }, null)).toBe(true);
    });

    it("leaves Defeated alone when its voting period cannot be located", () => {
      expect(
        needsOnChainStateRefresh(
          { state: "Defeated", startBlock: "0", endBlock: "0" },
          L1_HEAD
        )
      ).toBe(false);
    });

    it("re-reads an unrecognized state rather than trusting it", () => {
      expect(needsOnChainStateRefresh({ state: null }, L1_HEAD)).toBe(true);
      expect(needsOnChainStateRefresh({ state: "not-a-state" }, L1_HEAD)).toBe(
        true
      );
    });
  });

  describe("isProposalStateUnverified", () => {
    const RECONCILING: StateVerificationProgress = {
      currentGovernorBlock: L1_HEAD,
      governorClockPending: false,
      reconciled: false,
      reconcileFailed: false,
    };
    const RECENT_DEFEAT = {
      state: "DEFEATED",
      startBlock: String(SNAPSHOT_BLOCK),
      endBlock: "0",
    };

    it("withholds a Defeated status that is still being verified", () => {
      expect(isProposalStateUnverified(RECENT_DEFEAT, RECONCILING)).toBe(true);
    });

    it("shows the status once reconciliation has completed", () => {
      expect(
        isProposalStateUnverified(RECENT_DEFEAT, {
          ...RECONCILING,
          reconciled: true,
        })
      ).toBe(false);
    });

    it("falls back to the indexed status when reconciliation failed", () => {
      expect(
        isProposalStateUnverified(RECENT_DEFEAT, {
          ...RECONCILING,
          reconcileFailed: true,
        })
      ).toBe(false);
    });

    it("withholds while the governor clock is still loading", () => {
      // The recheck window cannot be evaluated yet, so do not risk showing a
      // status that turns out to have been worth rechecking.
      expect(
        isProposalStateUnverified(RECENT_DEFEAT, {
          ...RECONCILING,
          currentGovernorBlock: null,
          governorClockPending: true,
        })
      ).toBe(true);
    });

    it("shows the status when the governor clock is unavailable", () => {
      // Settled, not pending: no recheck is coming, so the indexed state is the
      // best answer available and withholding it forever would be worse.
      expect(
        isProposalStateUnverified(RECENT_DEFEAT, {
          ...RECONCILING,
          currentGovernorBlock: null,
          governorClockPending: false,
        })
      ).toBe(false);
    });

    it("shows a Defeated status that is outside the recheck window", () => {
      expect(
        isProposalStateUnverified(
          { state: "Defeated", startBlock: "17000000", endBlock: "0" },
          RECONCILING
        )
      ).toBe(false);
    });

    // Showing "Queued", then "Executed", then "Executing" over a few seconds
    // reads as three answers rather than one being refined.
    it("withholds the post-vote states that queue() and execute() advance", () => {
      for (const state of ["Succeeded", "Queued"]) {
        expect(
          isProposalStateUnverified({ state, endBlock: "0" }, RECONCILING)
        ).toBe(true);
      }
    });

    it("withholds Executed on a Core proposal that could still be in flight", () => {
      expect(
        isProposalStateUnverified(
          {
            state: "Executed",
            startBlock: String(SNAPSHOT_BLOCK),
            contractAddress: GOVERNORS.core.address,
          },
          RECONCILING
        )
      ).toBe(true);
    });

    it("shows Executed once the proposal is past the lifecycle window", () => {
      const oldSnapshot =
        L1_HEAD - (LIFECYCLE_WINDOW_DAYS + 1) * BLOCKS_PER_DAY.ethereum;

      expect(
        isProposalStateUnverified(
          {
            state: "Executed",
            startBlock: String(oldSnapshot),
            contractAddress: GOVERNORS.core.address,
          },
          RECONCILING
        )
      ).toBe(false);
    });

    // Treasury proposals never leave L2, so their Executed cannot become
    // Executing and there is nothing to wait for.
    it("shows Executed immediately for a Treasury proposal", () => {
      expect(
        isProposalStateUnverified(
          {
            state: "Executed",
            startBlock: String(SNAPSHOT_BLOCK),
            contractAddress: GOVERNORS.treasury.address,
          },
          RECONCILING
        )
      ).toBe(false);
    });

    it("shows the pre-vote states immediately", () => {
      for (const state of ["Active", "Pending", "Canceled", "Expired"]) {
        expect(
          isProposalStateUnverified({ state, endBlock: "0" }, RECONCILING)
        ).toBe(false);
      }
    });
  });

  describe("isIncompleteProposalState", () => {
    it("treats pending, active, queued, and unknown proposals as incomplete", () => {
      expect(isIncompleteProposalState("Pending")).toBe(true);
      expect(isIncompleteProposalState("active")).toBe(true);
      expect(isIncompleteProposalState("QUEUED")).toBe(true);
      expect(isIncompleteProposalState("Unknown")).toBe(true);
    });

    it("treats terminal proposal states as complete", () => {
      expect(isIncompleteProposalState("Succeeded")).toBe(false);
      expect(isIncompleteProposalState("Defeated")).toBe(false);
      expect(isIncompleteProposalState("Executed")).toBe(false);
    });

    it("returns false for empty values", () => {
      expect(isIncompleteProposalState(null)).toBe(false);
      expect(isIncompleteProposalState(undefined)).toBe(false);
      expect(isIncompleteProposalState("")).toBe(false);
    });
  });

  describe("mergeProposalData", () => {
    it("prefers live state and vote totals while keeping richer static metadata", () => {
      const staticProposal = {
        id: "1",
        contractAddress: "0x1111111111111111111111111111111111111111" as const,
        proposer: "0x2222222222222222222222222222222222222222",
        targets: ["0x3333333333333333333333333333333333333333"],
        values: ["0"],
        signatures: ["sig()"],
        calldatas: ["0x"],
        startBlock: "100",
        endBlock: "200",
        description: "Real proposal",
        networkId: "42161",
        state: "Pending" as const,
        governorName: "Core Governor",
        creationTxHash: "0xabc",
      };
      const liveProposal = {
        ...staticProposal,
        proposer: "Unknown",
        targets: [],
        description: "Proposal 1",
        state: "Active" as const,
        votes: {
          forVotes: "10",
          againstVotes: "2",
          abstainVotes: "1",
          quorum: "100",
        },
      };

      expect(mergeProposalData(staticProposal, liveProposal)).toEqual({
        ...staticProposal,
        state: "Active",
        votes: liveProposal.votes,
      });
    });
  });
});
