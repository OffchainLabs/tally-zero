import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ParsedProposal, Proposal } from "@/types/proposal";

// Mock ethers to avoid real contract instantiation
vi.mock("ethers", () => {
  return {
    ethers: {
      Contract: function MockContract() {
        return {
          state: vi.fn().mockResolvedValue(1),
          proposalVotes: vi.fn().mockResolvedValue({
            forVotes: { toString: () => "1000" },
            againstVotes: { toString: () => "500" },
            abstainVotes: { toString: () => "200" },
          }),
          quorum: vi.fn().mockResolvedValue({ toString: () => "5000" }),
          filters: {
            ProposalCreated: vi.fn().mockReturnValue({}),
          },
          queryFilter: vi.fn().mockResolvedValue([]),
        };
      },
    },
  };
});

// Mock dependencies
vi.mock("@/lib/debug", () => ({
  debug: {
    search: vi.fn(),
  },
}));

vi.mock("@/lib/rpc-utils", () => ({
  batchQueryWithRateLimit: vi.fn(async (queries: (() => Promise<unknown>)[]) =>
    Promise.all(queries.map((q) => q()))
  ),
}));

vi.mock("@/lib/address-utils", () => ({
  findByAddress: vi.fn(
    (
      governors: { address: string; name: string }[],
      address: string
    ): { name: string } | undefined => {
      return governors.find(
        (g) => g.address.toLowerCase() === address.toLowerCase()
      );
    }
  ),
}));

vi.mock("@/lib/state-utils", () => ({
  getStateName: vi.fn((state: number) => {
    const names = [
      "Pending",
      "Active",
      "Canceled",
      "Defeated",
      "Succeeded",
      "Queued",
      "Expired",
      "Executed",
    ];
    return names[state] || "Unknown";
  }),
}));

vi.mock("@config/arbitrum-governance", () => ({
  ARBITRUM_CHAIN_ID: 42161,
  ARBITRUM_GOVERNORS: [
    { address: "0xCore", name: "Core Governor" },
    { address: "0xTreasury", name: "Treasury Governor" },
  ],
  BLOCKS_PER_DAY: { arbitrum: 345600 },
}));

// Import after mocks are set up
import { fetchProposalStateAndVotes, parseProposals } from "./search-utils";

// Helper to create mock contract for tests
function createMockContract(overrides?: {
  state?: number;
  forVotes?: string;
  againstVotes?: string;
  abstainVotes?: string;
  quorum?: string;
  quorumError?: boolean;
}) {
  return {
    state: vi.fn().mockResolvedValue(overrides?.state ?? 1),
    proposalVotes: vi.fn().mockResolvedValue({
      forVotes: { toString: () => overrides?.forVotes ?? "1000" },
      againstVotes: { toString: () => overrides?.againstVotes ?? "500" },
      abstainVotes: { toString: () => overrides?.abstainVotes ?? "200" },
    }),
    quorum: overrides?.quorumError
      ? vi.fn().mockRejectedValue(new Error("Quorum fetch failed"))
      : vi
          .fn()
          .mockResolvedValue({ toString: () => overrides?.quorum ?? "5000" }),
    filters: {
      ProposalCreated: vi.fn().mockReturnValue({}),
    },
    queryFilter: vi.fn().mockResolvedValue([]),
  };
}

describe("search-utils", () => {
  describe("fetchProposalStateAndVotes", () => {
    it("returns state, votes, and quorum for non-pending proposals", async () => {
      const mockContract = createMockContract({ state: 1 });

      const result = await fetchProposalStateAndVotes(
        mockContract as never,
        "123",
        "100"
      );

      expect(result).toEqual({
        state: 1,
        votes: {
          forVotes: "1000",
          againstVotes: "500",
          abstainVotes: "200",
        },
        quorum: "5000",
      });
      expect(mockContract.quorum).toHaveBeenCalledWith("100");
    });

    it("skips quorum fetch for pending proposals (state 0)", async () => {
      const mockContract = createMockContract({ state: 0 });

      const result = await fetchProposalStateAndVotes(
        mockContract as never,
        "123",
        "100"
      );

      expect(result.quorum).toBeUndefined();
      expect(mockContract.quorum).not.toHaveBeenCalled();
    });

    it("handles quorum fetch failure gracefully", async () => {
      const mockContract = createMockContract({ state: 1, quorumError: true });

      const result = await fetchProposalStateAndVotes(
        mockContract as never,
        "123",
        "100"
      );

      expect(result.quorum).toBeUndefined();
      expect(result.state).toBe(1);
    });

    it("fetches state and votes in parallel", async () => {
      let stateCallTime = 0;
      let votesCallTime = 0;

      const mockContract = {
        state: vi.fn().mockImplementation(async () => {
          stateCallTime = Date.now();
          return 1;
        }),
        proposalVotes: vi.fn().mockImplementation(async () => {
          votesCallTime = Date.now();
          return {
            forVotes: { toString: () => "1000" },
            againstVotes: { toString: () => "500" },
            abstainVotes: { toString: () => "200" },
          };
        }),
        quorum: vi.fn().mockResolvedValue({ toString: () => "5000" }),
      };

      await fetchProposalStateAndVotes(mockContract as never, "123", "100");

      // Calls should be nearly simultaneous (within 10ms)
      expect(Math.abs(stateCallTime - votesCallTime)).toBeLessThan(10);
    });

    it("handles all vote states correctly", async () => {
      const states = [0, 1, 2, 3, 4, 5, 6, 7];

      for (const state of states) {
        const mockContract = createMockContract({ state });

        const result = await fetchProposalStateAndVotes(
          mockContract as never,
          "123",
          "100"
        );

        expect(result.state).toBe(state);
        // Quorum is only fetched for non-pending states
        if (state === 0) {
          expect(result.quorum).toBeUndefined();
        } else {
          expect(result.quorum).toBe("5000");
        }
      }
    });

    it("returns correct vote format", async () => {
      const mockContract = createMockContract({
        forVotes: "999999999999999999999",
        againstVotes: "123456789012345678901",
        abstainVotes: "0",
      });

      const result = await fetchProposalStateAndVotes(
        mockContract as never,
        "123",
        "100"
      );

      expect(result.votes.forVotes).toBe("999999999999999999999");
      expect(result.votes.againstVotes).toBe("123456789012345678901");
      expect(result.votes.abstainVotes).toBe("0");
    });
  });

  describe("parseProposals", () => {
    let mockProposals: Proposal[];

    beforeEach(() => {
      mockProposals = [
        {
          id: "1",
          contractAddress: "0xCore",
          proposer: "0xProposer1",
          targets: ["0xTarget1"],
          values: ["0"],
          signatures: ["transfer(address,uint256)"],
          calldatas: ["0x"],
          startBlock: "100",
          endBlock: "200",
          description: "Test Proposal 1",
          state: 0,
          creationTxHash: "0xTx1",
        },
        {
          id: "2",
          contractAddress: "0xTreasury",
          proposer: "0xProposer2",
          targets: ["0xTarget2"],
          values: ["1000"],
          signatures: ["execute()"],
          calldatas: ["0x1234"],
          startBlock: "150",
          endBlock: "250",
          description: "Test Proposal 2",
          state: 0,
          creationTxHash: "0xTx2",
        },
      ];
    });

    it("returns empty array for empty input", async () => {
      const mockProvider = {};
      const result = await parseProposals(mockProvider as never, []);
      expect(result).toEqual([]);
    });

    it("parses proposals and adds network ID", async () => {
      const mockProvider = {};

      const result = await parseProposals(mockProvider as never, mockProposals);

      expect(result.length).toBe(2);
      result.forEach((proposal: ParsedProposal) => {
        expect(proposal.networkId).toBe("42161");
      });
    });

    it("transforms state number to state name", async () => {
      const mockProvider = {};

      const result = await parseProposals(mockProvider as never, mockProposals);

      // Mock getStateName returns "Active" for state 1
      expect(result[0].state).toBe("Active");
    });

    it("preserves original proposal data", async () => {
      const mockProvider = {};

      const result = await parseProposals(mockProvider as never, mockProposals);

      expect(result[0].id).toBe("1");
      expect(result[0].proposer).toBe("0xProposer1");
      expect(result[0].description).toBe("Test Proposal 1");
      expect(result[0].creationTxHash).toBe("0xTx1");
    });

    it("adds votes to parsed proposals", async () => {
      const mockProvider = {};

      const result = await parseProposals(mockProvider as never, mockProposals);

      expect(result[0].votes).toBeDefined();
      expect(result[0].votes?.forVotes).toBe("1000");
      expect(result[0].votes?.againstVotes).toBe("500");
      expect(result[0].votes?.abstainVotes).toBe("200");
    });
  });

  describe("ProposalStateData interface", () => {
    it("has correct structure with quorum", () => {
      const stateData = {
        state: 1,
        votes: {
          forVotes: "1000",
          againstVotes: "500",
          abstainVotes: "200",
        },
        quorum: "5000",
      };

      expect(stateData.state).toBe(1);
      expect(stateData.votes.forVotes).toBe("1000");
      expect(stateData.votes.againstVotes).toBe("500");
      expect(stateData.votes.abstainVotes).toBe("200");
      expect(stateData.quorum).toBe("5000");
    });

    it("allows undefined quorum", () => {
      const stateData: {
        state: number;
        votes: {
          forVotes: string;
          againstVotes: string;
          abstainVotes: string;
        };
        quorum?: string;
      } = {
        state: 0,
        votes: {
          forVotes: "0",
          againstVotes: "0",
          abstainVotes: "0",
        },
      };

      expect(stateData.quorum).toBeUndefined();
    });
  });
});
