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
      utils: {
        // The multicall path decodes proposalVotes through the interface. The
        // encoded form here is "<fn>:<arg>", matching the encodeCall mock.
        Interface: function MockInterface() {
          return {
            encodeFunctionData: (fn: string, args: unknown[]) =>
              `${fn}:${args[0]}`,
            decodeFunctionResult: (fn: string, data: string) => {
              const [, value] = data.split(":");
              if (fn === "proposalVotes") {
                const [forVotes, againstVotes, abstainVotes] = value.split(",");
                return {
                  forVotes: { toString: () => forVotes },
                  againstVotes: { toString: () => againstVotes },
                  abstainVotes: { toString: () => abstainVotes },
                };
              }
              return [value];
            },
          };
        },
      },
    },
  };
});

const multicallMocks = vi.hoisted(() => ({ multicall: vi.fn() }));

vi.mock("@/lib/multicall", () => ({
  multicall: multicallMocks.multicall,
  encodeCall: (
    _iface: unknown,
    functionName: string,
    args: unknown[]
  ): string => `${functionName}:${args[0]}`,
  decodeResult: (_iface: unknown, fn: string, data: string) => {
    const [, value] = data.split(":");
    return fn === "state" ? Number(value) : { toString: () => value };
  },
}));

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
import {
  fetchProposalStateAndVotes,
  parseProposals,
  refreshProposalStates,
} from "./search-utils";

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
  describe("refreshProposalStates", () => {
    function makeProposal(
      overrides: Partial<ParsedProposal> & Pick<ParsedProposal, "id">
    ): ParsedProposal {
      return {
        contractAddress: "0xCore" as ParsedProposal["contractAddress"],
        proposer: "0xproposer",
        targets: [],
        values: [],
        signatures: [],
        calldatas: [],
        startBlock: "25547165",
        endBlock: "0",
        description: "A proposal",
        networkId: "42161",
        state: "Queued",
        governorName: "Core Governor",
        ...overrides,
      };
    }

    const provider = {} as Parameters<typeof refreshProposalStates>[0];

    beforeEach(() => {
      multicallMocks.multicall.mockReset();
    });

    // The table withholds these rows' statuses until this answers, so the whole
    // refresh is one round trip rather than two per proposal.
    it("reads every proposal in a single multicall", async () => {
      multicallMocks.multicall.mockResolvedValue([
        { success: true, returnData: "state:7" },
        { success: true, returnData: "proposalVotes:1000,500,200" },
        { success: true, returnData: "state:1" },
        { success: true, returnData: "proposalVotes:10,20,30" },
      ]);

      const refreshed = await refreshProposalStates(provider, [
        makeProposal({ id: "9950" }),
        makeProposal({ id: "7191" }),
      ]);

      expect(multicallMocks.multicall).toHaveBeenCalledTimes(1);
      expect(refreshed[0].state).toBe("Executed");
      expect(refreshed[0].votes).toEqual({
        forVotes: "1000",
        againstVotes: "500",
        abstainVotes: "200",
        quorum: undefined,
      });
      expect(refreshed[1].state).toBe("Active");
      expect(refreshed[1].votes?.forVotes).toBe("10");
    });

    // quorum(snapshot) walks token checkpoints at a historical block and costs
    // a fifth of the wait, for a number no status depends on. QuorumCell reads
    // it for the rows that display it.
    it("does not read quorum, and keeps any the row already had", async () => {
      multicallMocks.multicall.mockResolvedValue([
        { success: true, returnData: "state:7" },
        { success: true, returnData: "proposalVotes:1000,500,200" },
      ]);

      const refreshed = await refreshProposalStates(provider, [
        makeProposal({
          id: "9950",
          votes: {
            forVotes: "1",
            againstVotes: "2",
            abstainVotes: "3",
            quorum: "5000",
          },
        }),
      ]);

      expect(multicallMocks.multicall.mock.calls[0][1]).toHaveLength(2);
      expect(refreshed[0].votes?.quorum).toBe("5000");
    });

    it("keeps the cached proposal when the governor call reverts", async () => {
      // aggregate3 absorbs the revert with allowFailure, so the batch still
      // returns and only this proposal is left as it was.
      multicallMocks.multicall.mockResolvedValue([
        { success: false, returnData: "0x" },
        { success: false, returnData: "0x" },
        { success: false, returnData: "0x" },
      ]);

      const cached = makeProposal({ id: "9950", state: "Queued" });
      const refreshed = await refreshProposalStates(provider, [cached]);

      expect(refreshed[0]).toBe(cached);
    });

    it("falls back to per-proposal reads when the multicall fails", async () => {
      multicallMocks.multicall.mockRejectedValue(new Error("no multicall3"));

      const refreshed = await refreshProposalStates(provider, [
        makeProposal({ id: "9950" }),
      ]);

      // The mocked contract answers state 1 / 1000-500-200 / quorum 5000
      expect(refreshed[0].state).toBe("Active");
      expect(refreshed[0].votes).toEqual({
        forVotes: "1000",
        againstVotes: "500",
        abstainVotes: "200",
        quorum: "5000",
      });
    });
  });
});
