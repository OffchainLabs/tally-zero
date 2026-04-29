import { describe, expect, it } from "vitest";

import {
  hasZeroVotingPower,
  isActiveProposalState,
  shouldRenderProposalVoteCard,
  shouldShowVoteActionSection,
  shouldShowVoteStats,
} from "./proposal-vote-visibility";

describe("proposal-vote-visibility", () => {
  describe("isActiveProposalState", () => {
    it("returns true for active proposals regardless of case", () => {
      expect(isActiveProposalState("active")).toBe(true);
      expect(isActiveProposalState("Active")).toBe(true);
      expect(isActiveProposalState("aCtIvE")).toBe(true);
    });

    it("returns false for non-active proposals", () => {
      expect(isActiveProposalState("queued")).toBe(false);
    });
  });

  describe("hasZeroVotingPower", () => {
    it("returns true for zero voting power", () => {
      expect(hasZeroVotingPower(BigInt(0))).toBe(true);
    });

    it("returns false for positive or unknown voting power", () => {
      expect(hasZeroVotingPower(BigInt(1))).toBe(false);
      expect(hasZeroVotingPower(undefined)).toBe(false);
    });
  });

  describe("shouldShowVoteStats", () => {
    it("shows vote stats for connected wallets", () => {
      expect(shouldShowVoteStats({ isConnected: true })).toBe(true);
    });

    it("hides vote stats for disconnected wallets", () => {
      expect(shouldShowVoteStats({ isConnected: false })).toBe(false);
    });
  });

  describe("shouldShowVoteActionSection", () => {
    it("shows the vote action section when the user has not voted and has non-zero or unknown voting power", () => {
      expect(
        shouldShowVoteActionSection({
          hasRecordedVote: false,
          votingPower: BigInt(1),
        })
      ).toBe(true);
      expect(
        shouldShowVoteActionSection({
          hasRecordedVote: false,
          votingPower: undefined,
        })
      ).toBe(true);
    });

    it("hides the vote action section when the user already voted", () => {
      expect(
        shouldShowVoteActionSection({
          hasRecordedVote: true,
          votingPower: BigInt(100),
        })
      ).toBe(false);
    });

    it("hides the vote action section when voting power is zero", () => {
      expect(
        shouldShowVoteActionSection({
          hasRecordedVote: false,
          votingPower: BigInt(0),
        })
      ).toBe(false);
    });
  });

  describe("shouldRenderProposalVoteCard", () => {
    it("does not render the vote card for disconnected wallets", () => {
      expect(
        shouldRenderProposalVoteCard({
          isConnected: false,
        })
      ).toBe(false);
    });

    it("renders the vote card for connected wallets on active proposals", () => {
      expect(
        shouldRenderProposalVoteCard({
          isConnected: true,
        })
      ).toBe(true);
    });
  });
});
