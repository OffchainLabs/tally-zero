import type { ParsedProposal } from "@/types/proposal";
import { describe, expect, it } from "vitest";
import {
  assignProposalNumbers,
  numberCompleteList,
  sortProposals,
} from "./proposal-cache";

const createProposal = (
  overrides: Partial<ParsedProposal>
): ParsedProposal => ({
  id: "1",
  contractAddress: "0xf07DeD9dC292157749B6Fd268E37DF6EA38395B9",
  proposer: "0xb4c064f466931B8d0F637654c916E3F203c46f13",
  targets: ["0x0000000000000000000000000000000000000064"],
  values: ["0"],
  signatures: [""],
  calldatas: ["0x"],
  startBlock: "23943007",
  endBlock: "24043807",
  description: "Test proposal",
  networkId: "42161",
  state: "Executed",
  governorName: "Core Governor",
  ...overrides,
});

const activeProposal = createProposal({
  id: "1",
  state: "Active",
  startBlock: "23943007",
});

const executedProposal = createProposal({
  id: "2",
  state: "Executed",
  startBlock: "23593417",
});

const defeatedProposal = createProposal({
  id: "4",
  state: "Defeated",
  startBlock: "22000000",
});

describe("proposal-cache", () => {
  describe("sortProposals", () => {
    it("puts active proposals first", () => {
      const proposals = [executedProposal, activeProposal, defeatedProposal];
      const sorted = sortProposals(proposals);

      expect(sorted[0].state).toBe("Active");
    });

    it("sorts by startBlock descending within same state", () => {
      const active1 = createProposal({
        id: "a1",
        state: "Active",
        startBlock: "1000",
      });
      const active2 = createProposal({
        id: "a2",
        state: "Active",
        startBlock: "2000",
      });
      const active3 = createProposal({
        id: "a3",
        state: "Active",
        startBlock: "1500",
      });

      const sorted = sortProposals([active1, active2, active3]);

      expect(sorted.map((p) => p.startBlock)).toEqual(["2000", "1500", "1000"]);
    });

    it("handles mixed states", () => {
      const proposals = [
        createProposal({ id: "1", state: "Executed", startBlock: "3000" }),
        createProposal({ id: "2", state: "Active", startBlock: "1000" }),
        createProposal({ id: "3", state: "Pending", startBlock: "4000" }),
        createProposal({ id: "4", state: "Active", startBlock: "2000" }),
      ];

      const sorted = sortProposals(proposals);

      expect(sorted[0].state).toBe("Active");
      expect(sorted[1].state).toBe("Active");
      expect(sorted[0].startBlock).toBe("2000");
      expect(sorted[1].startBlock).toBe("1000");
    });

    it("does not mutate original array", () => {
      const proposals = [executedProposal, activeProposal];
      const originalOrder = [...proposals];

      sortProposals(proposals);

      expect(proposals).toEqual(originalOrder);
    });
  });

  describe("assignProposalNumbers", () => {
    it("numbers by creation block, oldest first, keeping input order", () => {
      const proposals = [
        createProposal({ id: "newest", createdAtBlock: 300 }),
        createProposal({ id: "oldest", createdAtBlock: 100 }),
        createProposal({ id: "middle", createdAtBlock: 200 }),
      ];

      const numbered = assignProposalNumbers(proposals);

      expect(numbered.map((p) => p.id)).toEqual(["newest", "oldest", "middle"]);
      expect(numbered.map((p) => p.proposalNumber)).toEqual([3, 1, 2]);
    });

    // Real magnitudes: the snapshot block is the governor's L1 clock (~25M)
    // while the creation block is an L2 height (~400M). Ordering across the
    // two would put the unnumbered row first no matter how new it is.
    it("leaves a row with no creation block unnumbered", () => {
      const proposals = [
        createProposal({ id: "no-creation-block", startBlock: "25600000" }),
        createProposal({
          id: "oldest",
          createdAtBlock: 400_000_000,
          startBlock: "25000000",
        }),
        createProposal({
          id: "newest",
          createdAtBlock: 480_000_000,
          startBlock: "25500000",
        }),
      ];

      const numbered = assignProposalNumbers(proposals);
      const numberOf = (id: string) =>
        numbered.find((p) => p.id === id)?.proposalNumber;

      expect(numberOf("oldest")).toBe(1);
      expect(numberOf("newest")).toBe(2);
      expect(numberOf("no-creation-block")).toBeUndefined();
    });

    it("clears a stale number when the creation block goes missing", () => {
      const stale = createProposal({ id: "stale", proposalNumber: 4 });

      const [numbered] = assignProposalNumbers([stale]);

      expect(numbered.proposalNumber).toBeUndefined();
    });

    it("breaks ties in the same block by proposal id", () => {
      const proposals = [
        createProposal({ id: "b", createdAtBlock: 42 }),
        createProposal({ id: "a", createdAtBlock: 42 }),
      ];

      const numbered = assignProposalNumbers(proposals);

      expect(numbered.map((p) => p.proposalNumber)).toEqual([2, 1]);
    });

    it("returns the same object when a row's number is unchanged", () => {
      const already = createProposal({
        id: "1",
        createdAtBlock: 1,
        proposalNumber: 1,
      });

      const [numbered] = assignProposalNumbers([already]);

      expect(numbered).toBe(already);
    });

    it("does not mutate original array", () => {
      const proposals = [executedProposal, activeProposal];
      const originalOrder = [...proposals];

      assignProposalNumbers(proposals);

      expect(proposals).toEqual(originalOrder);
      expect(proposals[0].proposalNumber).toBeUndefined();
    });
  });

  describe("numberCompleteList", () => {
    const proposals = [
      createProposal({ id: "a", createdAtBlock: 400_000_000 }),
      createProposal({ id: "b", createdAtBlock: 480_000_000 }),
    ];

    it("numbers the rows when the indexer served the list", () => {
      const result = numberCompleteList(proposals, true);

      expect(result.map((p) => p.proposalNumber)).toEqual([1, 2]);
    });

    // Without the indexer the list is a recent RPC window, so numbering it
    // would label the newest proposals 1 and 2.
    it("leaves the rows unnumbered when it is only an RPC window", () => {
      const result = numberCompleteList(proposals, false);

      expect(result.map((p) => p.proposalNumber)).toEqual([
        undefined,
        undefined,
      ]);
      expect(result).toBe(proposals);
    });
  });
});
