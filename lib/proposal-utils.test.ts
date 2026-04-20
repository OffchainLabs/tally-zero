import { describe, expect, it } from "vitest";

import { isIncompleteProposalState, mergeProposalData } from "./proposal-utils";

describe("proposal-utils", () => {
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
