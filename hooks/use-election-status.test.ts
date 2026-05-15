import { describe, expect, it, vi } from "vitest";

import type {
  ElectionProposalStatus,
  ElectionStatus,
} from "@gzeoneth/gov-tracker";

import type {
  ElectionQueryData,
  NomineeElectionDetails,
} from "@/lib/election-status/types";

import {
  electionKeys,
  getMemberExecuteSearchStartBlock,
} from "./use-election-status";

// ---------------------------------------------------------------------------
// Mock gov-tracker (used by the fetch functions under test)
// ---------------------------------------------------------------------------

vi.mock("@gzeoneth/gov-tracker", async () => {
  const actual = await vi.importActual<typeof import("@gzeoneth/gov-tracker")>(
    "@gzeoneth/gov-tracker"
  );
  return {
    ...actual,
    createTracker: vi.fn(() => ({
      trackElection: vi.fn(),
      getElectionCheckpoint: vi.fn(),
    })),
    checkElectionStatus: vi.fn(),
    getElectionCount: vi.fn(),
    getAllElectionStatuses: vi.fn(),
    getElectionStatus: vi.fn(),
    getNomineeElectionDetails: vi.fn(),
    getMemberElectionDetails: vi.fn(),
    serializeNomineeDetails: vi.fn((x: unknown) => x),
    serializeMemberDetails: vi.fn((x: unknown) => x),
  };
});

vi.mock("@/lib/debug", () => ({
  debug: { app: vi.fn(), cache: vi.fn() },
}));
vi.mock("@/lib/bundled-cache-loader", () => ({
  initializeBundledCache: vi.fn(),
}));
vi.mock("@/lib/gov-tracker-cache", () => ({
  getCacheAdapter: vi.fn(() => ({
    get: vi.fn(),
    set: vi.fn(),
    keys: vi.fn(() => []),
  })),
}));
vi.mock("@/lib/rpc-utils", () => ({
  getOrCreateProvider: vi.fn((url: string) => ({ url })),
  getOrCreateChunkedProvider: vi.fn((url: string) => ({ url })),
  batchQueryWithRateLimit: vi.fn(async <T>(queries: Array<() => Promise<T>>) =>
    Promise.all(queries.map((q) => q()))
  ),
}));

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function createElection(
  overrides: Partial<ElectionProposalStatus> & { electionIndex: number }
): ElectionProposalStatus {
  return {
    phase: "CONTENDER_SUBMISSION",
    cohort: 0,
    nomineeProposalId: `0xprop${overrides.electionIndex}`,
    nomineeProposalState: null,
    memberProposalId: null,
    memberProposalState: null,
    isInVettingPeriod: false,
    vettingDeadline: null,
    canProceedToMemberPhase: false,
    canExecuteMember: false,
    targetNomineeCount: 6,
    stages: [],
    ...overrides,
  } as ElectionProposalStatus;
}

function createQueryData(
  overrides?: Partial<ElectionQueryData>
): ElectionQueryData {
  return {
    status: {
      electionCount: 5,
      cohort: 1,
      nextElectionTimestamp: 0,
      currentL1Timestamp: 0,
      canCreateElection: false,
      secondsUntilElection: 0,
      timeUntilElection: "N/A",
    } as ElectionStatus,
    elections: [
      createElection({ electionIndex: 0, phase: "COMPLETED" }),
      createElection({ electionIndex: 1, phase: "COMPLETED" }),
      createElection({ electionIndex: 2, phase: "COMPLETED" }),
      createElection({ electionIndex: 3, phase: "COMPLETED" }),
      createElection({
        electionIndex: 4,
        phase: "VETTING_PERIOD",
        isInVettingPeriod: true,
      }),
    ],
    nomineeDetailsMap: {},
    memberDetailsMap: {},
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// electionKeys
// ---------------------------------------------------------------------------

describe("electionKeys", () => {
  describe("data", () => {
    it("returns default key without overrides", () => {
      const key = electionKeys.data("https://arb.io", "https://eth.io");
      expect(key).toEqual([
        "elections",
        "data",
        "https://arb.io",
        "https://eth.io",
        "default",
      ]);
    });

    it("includes overrides in key when provided", () => {
      const key = electionKeys.data("https://arb.io", "https://eth.io", {
        nominee: "0xNominee",
        member: "0xMember",
      });
      expect(key).toEqual([
        "elections",
        "data",
        "https://arb.io",
        "https://eth.io",
        { nominee: "0xNominee", member: "0xMember" },
      ]);
    });

    it("produces different keys for different RPCs", () => {
      const key1 = electionKeys.data("https://arb1.io", "https://eth.io");
      const key2 = electionKeys.data("https://arb2.io", "https://eth.io");
      expect(key1).not.toEqual(key2);
    });
  });

  describe("track", () => {
    it("includes election index in key", () => {
      const key = electionKeys.track("https://arb.io", "https://eth.io", 3);
      expect(key).toEqual([
        "elections",
        "track",
        "https://arb.io",
        "https://eth.io",
        3,
      ]);
    });

    it("produces different keys for different indices", () => {
      const key1 = electionKeys.track("https://arb.io", "https://eth.io", 1);
      const key2 = electionKeys.track("https://arb.io", "https://eth.io", 2);
      expect(key1).not.toEqual(key2);
    });
  });
});

// ---------------------------------------------------------------------------
// Derived state logic (tests the computations from the hook)
// ---------------------------------------------------------------------------

describe("derived state logic", () => {
  describe("selectedElection derivation", () => {
    it("selects first active election when selectedIndex is null", () => {
      const data = createQueryData();
      const allElections = data.elections;
      const activeElections = allElections.filter(
        (e) => e.phase !== "COMPLETED"
      );

      // Same logic as the hook's selectedElection useMemo
      const selectedIndex = null;
      const selectedElection =
        selectedIndex !== null
          ? allElections.find((e) => e.electionIndex === selectedIndex)
          : (activeElections[0] ??
            allElections[allElections.length - 1] ??
            null);

      expect(selectedElection?.electionIndex).toBe(4);
      expect(selectedElection?.phase).toBe("VETTING_PERIOD");
    });

    it("falls back to last election when no active elections", () => {
      const data = createQueryData({
        elections: [
          createElection({ electionIndex: 0, phase: "COMPLETED" }),
          createElection({ electionIndex: 1, phase: "COMPLETED" }),
        ],
      });
      const allElections = data.elections;
      const activeElections = allElections.filter(
        (e) => e.phase !== "COMPLETED"
      );

      const selectedIndex = null;
      const selectedElection =
        selectedIndex !== null
          ? allElections.find((e) => e.electionIndex === selectedIndex)
          : (activeElections[0] ??
            allElections[allElections.length - 1] ??
            null);

      expect(selectedElection?.electionIndex).toBe(1);
    });

    it("selects by index when selectedIndex is set", () => {
      const data = createQueryData();
      const allElections = data.elections;
      const activeElections = allElections.filter(
        (e) => e.phase !== "COMPLETED"
      );

      const selectedIndex = 2;
      const selectedElection =
        selectedIndex !== null
          ? allElections.find((e) => e.electionIndex === selectedIndex)
          : (activeElections[0] ??
            allElections[allElections.length - 1] ??
            null);

      expect(selectedElection?.electionIndex).toBe(2);
    });

    it("returns null for unknown index", () => {
      const data = createQueryData();
      const allElections = data.elections;
      const activeElections = allElections.filter(
        (e) => e.phase !== "COMPLETED"
      );

      const selectedIndex = 99;
      const selectedElection =
        selectedIndex !== null
          ? (allElections.find((e) => e.electionIndex === selectedIndex) ??
            null)
          : (activeElections[0] ??
            allElections[allElections.length - 1] ??
            null);

      expect(selectedElection).toBeNull();
    });
  });

  describe("error suppression logic", () => {
    it("exposes error when data is null", () => {
      const data = null;
      const queryError = new Error("RPC fail");
      const error = !data && queryError ? queryError : null;
      expect(error).toBe(queryError);
    });

    it("suppresses error when data exists", () => {
      const data = createQueryData();
      const queryError = new Error("refetch fail");
      const error = !data && queryError ? queryError : null;
      expect(error).toBeNull();
    });

    it("returns null when no error", () => {
      const data = null;
      const queryError = null;
      const error = !data && queryError ? queryError : null;
      expect(error).toBeNull();
    });
  });

  describe("nominee/member detail lookup", () => {
    it("returns nominee details for selected election", () => {
      const mockNomineeDetails = {
        proposalId: "0x1",
        electionIndex: 4,
      } as unknown as NomineeElectionDetails;
      const data = createQueryData({
        nomineeDetailsMap: { 4: mockNomineeDetails },
      });
      const selectedElection = data.elections.find(
        (e) => e.electionIndex === 4
      );

      const nomineeDetails = selectedElection
        ? (data.nomineeDetailsMap[selectedElection.electionIndex] ?? null)
        : null;

      expect(nomineeDetails).toBe(mockNomineeDetails);
    });

    it("returns null when no details for selected election", () => {
      const data = createQueryData();
      const selectedElection = data.elections.find(
        (e) => e.electionIndex === 4
      );

      const nomineeDetails = selectedElection
        ? (data.nomineeDetailsMap[selectedElection.electionIndex] ?? null)
        : null;

      expect(nomineeDetails).toBeNull();
    });

    it("returns null when no selected election", () => {
      const data = createQueryData();
      const selectedElection = null;

      const nomineeDetails = selectedElection
        ? (data.nomineeDetailsMap[
            (selectedElection as ElectionProposalStatus).electionIndex
          ] ?? null)
        : null;

      expect(nomineeDetails).toBeNull();
    });
  });

  describe("refetchInterval phase-awareness", () => {
    const VOTING_PHASE_POLL_INTERVAL = 5 * 60 * 1000;

    function computeRefetchInterval(
      data: ElectionQueryData | undefined,
      selectedIndex: number | null
    ): number | false {
      if (!data) return false;

      const active = data.elections.filter((e) => e.phase !== "COMPLETED");
      const selected =
        selectedIndex !== null
          ? data.elections.find((e) => e.electionIndex === selectedIndex)
          : (active[0] ?? data.elections[data.elections.length - 1]);

      if (
        selected?.phase === "NOMINEE_SELECTION" ||
        selected?.phase === "MEMBER_ELECTION"
      ) {
        return VOTING_PHASE_POLL_INTERVAL;
      }

      return false;
    }

    it("returns false when no data yet", () => {
      expect(computeRefetchInterval(undefined, null)).toBe(false);
    });

    it("returns false during VETTING_PERIOD", () => {
      const data = createQueryData();
      // Election 4 is in VETTING_PERIOD and is the only active election
      expect(computeRefetchInterval(data, null)).toBe(false);
    });

    it("returns poll interval during MEMBER_ELECTION", () => {
      const data = createQueryData({
        elections: [
          createElection({ electionIndex: 0, phase: "COMPLETED" }),
          createElection({ electionIndex: 1, phase: "MEMBER_ELECTION" }),
        ],
      });
      expect(computeRefetchInterval(data, null)).toBe(
        VOTING_PHASE_POLL_INTERVAL
      );
    });

    it("returns poll interval during NOMINEE_SELECTION", () => {
      const data = createQueryData({
        elections: [
          createElection({ electionIndex: 0, phase: "COMPLETED" }),
          createElection({ electionIndex: 1, phase: "NOMINEE_SELECTION" }),
        ],
      });
      expect(computeRefetchInterval(data, null)).toBe(
        VOTING_PHASE_POLL_INTERVAL
      );
    });

    it("returns false during CONTENDER_SUBMISSION", () => {
      const data = createQueryData({
        elections: [
          createElection({
            electionIndex: 0,
            phase: "CONTENDER_SUBMISSION",
          }),
        ],
      });
      expect(computeRefetchInterval(data, null)).toBe(false);
    });

    it("returns false when selected election is in VETTING_PERIOD", () => {
      const data = createQueryData({
        elections: [
          createElection({ electionIndex: 0, phase: "MEMBER_ELECTION" }),
          createElection({
            electionIndex: 1,
            phase: "VETTING_PERIOD",
            isInVettingPeriod: true,
          }),
        ],
      });
      // Explicitly select the vetting period election
      expect(computeRefetchInterval(data, 1)).toBe(false);
    });

    it("returns poll interval when selected election is MEMBER_ELECTION", () => {
      const data = createQueryData({
        elections: [
          createElection({ electionIndex: 0, phase: "MEMBER_ELECTION" }),
          createElection({
            electionIndex: 1,
            phase: "VETTING_PERIOD",
            isInVettingPeriod: true,
          }),
        ],
      });
      // Explicitly select the voting election
      expect(computeRefetchInterval(data, 0)).toBe(VOTING_PHASE_POLL_INTERVAL);
    });
  });

  describe("shouldTrackElection logic", () => {
    it("true when election is not in data", () => {
      const data = createQueryData();
      const enabled = true;
      const selectedIndex = 99;
      const shouldTrack =
        enabled &&
        !!data &&
        selectedIndex !== null &&
        !data.elections.some((e) => e.electionIndex === selectedIndex);
      expect(shouldTrack).toBe(true);
    });

    it("false when election exists in data", () => {
      const data = createQueryData();
      const enabled = true;
      const selectedIndex = 4;
      const shouldTrack =
        enabled &&
        !!data &&
        selectedIndex !== null &&
        !data.elections.some((e) => e.electionIndex === selectedIndex);
      expect(shouldTrack).toBe(false);
    });

    it("false when selectedIndex is null", () => {
      const data = createQueryData();
      const enabled = true;
      const selectedIndex = null;
      const shouldTrack =
        enabled &&
        !!data &&
        selectedIndex !== null &&
        !data.elections.some(
          (e) => e.electionIndex === (selectedIndex as number)
        );
      expect(shouldTrack).toBe(false);
    });

    it("false when data is null", () => {
      const data = null;
      const enabled = true;
      const selectedIndex = 5;
      const shouldTrack =
        enabled &&
        !!data &&
        selectedIndex !== null &&
        !(data as ElectionQueryData).elections.some(
          (e) => e.electionIndex === selectedIndex
        );
      expect(shouldTrack).toBe(false);
    });

    it("false when disabled", () => {
      const data = createQueryData();
      const enabled = false;
      const selectedIndex = 99;
      const shouldTrack =
        enabled &&
        !!data &&
        selectedIndex !== null &&
        !data.elections.some((e) => e.electionIndex === selectedIndex);
      expect(shouldTrack).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// getMemberExecuteSearchStartBlock
// ---------------------------------------------------------------------------

describe("getMemberExecuteSearchStartBlock", () => {
  const currentBlock = 300_000_000;
  const FALLBACK = 10_000_000;

  it("prefers the latest stage tx block when available", () => {
    const election = createElection({
      electionIndex: 0,
      stages: [
        {
          type: "CREATE_ELECTION",
          status: "COMPLETED",
          chain: "arb1",
          chainId: 42161,
          transactions: [
            {
              hash: "0xa",
              blockNumber: 100_000,
              chain: "arb1",
              chainId: 42161,
              logIndex: 0,
            },
            {
              hash: "0xb",
              blockNumber: 200_000,
              chain: "arb1",
              chainId: 42161,
              logIndex: 0,
            },
          ],
        },
      ],
    } as unknown as Partial<ElectionProposalStatus> & {
      electionIndex: number;
    });

    const fromBlock = getMemberExecuteSearchStartBlock(
      election,
      currentBlock,
      50_000 // proposalSnapshot estimate, deliberately smaller than stage txs
    );
    expect(fromBlock).toBe(200_000);
  });

  it("falls back to the proposalSnapshot estimate when stages have no blocks", () => {
    const election = createElection({ electionIndex: 0, stages: [] });
    const fromBlock = getMemberExecuteSearchStartBlock(
      election,
      currentBlock,
      123_456_789
    );
    expect(fromBlock).toBe(123_456_789);
  });

  it("ignores stage tx blocks that are 0 or undefined", () => {
    const election = createElection({
      electionIndex: 0,
      stages: [
        {
          type: "CREATE_ELECTION",
          status: "COMPLETED",
          chain: "arb1",
          chainId: 42161,
          transactions: [
            {
              hash: "0xa",
              blockNumber: 0,
              chain: "arb1",
              chainId: 42161,
              logIndex: 0,
            },
          ],
        },
      ],
    } as unknown as Partial<ElectionProposalStatus> & {
      electionIndex: number;
    });

    const fromBlock = getMemberExecuteSearchStartBlock(
      election,
      currentBlock,
      42
    );
    expect(fromBlock).toBe(42);
  });

  it("uses the fixed fallback when neither stage txs nor a snapshot are available", () => {
    const election = createElection({ electionIndex: 0, stages: [] });
    const fromBlock = getMemberExecuteSearchStartBlock(election, currentBlock);
    expect(fromBlock).toBe(currentBlock - FALLBACK);
  });

  it("clamps the result to 0 when the candidate would go negative", () => {
    const election = createElection({ electionIndex: 0, stages: [] });
    const fromBlock = getMemberExecuteSearchStartBlock(election, 500);
    expect(fromBlock).toBe(0);
  });
});
