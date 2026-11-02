import type { ParsedProposal } from "@/types/proposal";
import { describe, expect, it } from "vitest";
import { assignProposalNumbers, sortProposals } from "./proposal-cache";

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

    it("falls back to the snapshot block when the creation block is unknown", () => {
      const proposals = [
        createProposal({ id: "rpc", startBlock: "5000" }),
        createProposal({
          id: "indexed",
          createdAtBlock: 10,
          startBlock: "4000",
        }),
      ];

      const numbered = assignProposalNumbers(proposals);

      expect(numbered.find((p) => p.id === "indexed")?.proposalNumber).toBe(1);
      expect(numbered.find((p) => p.id === "rpc")?.proposalNumber).toBe(2);
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
});
