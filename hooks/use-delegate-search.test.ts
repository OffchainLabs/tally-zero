/**
 * Tests for use-delegate-search filter utilities
 */

import { describe, expect, it } from "vitest";

import type { DelegateInfo } from "@/types/delegate";

import {
  filterDelegates,
  sortDelegatesByVotingPower,
} from "./use-delegate-search";

// Test fixtures
const mockDelegates: DelegateInfo[] = [
  {
    address: "0x1234567890abcdef1234567890abcdef12345678",
    votingPower: "1000000000000000000000",
    lastChangeBlock: 100,
  }, // 1000 tokens
  {
    address: "0xabcdef1234567890abcdef1234567890abcdef12",
    votingPower: "500000000000000000000",
    lastChangeBlock: 200,
  }, // 500 tokens
  {
    address: "0x9876543210fedcba9876543210fedcba98765432",
    votingPower: "100000000000000000000",
    lastChangeBlock: 300,
  }, // 100 tokens
  {
    address: "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
    votingPower: "50000000000000000000",
    lastChangeBlock: 400,
  }, // 50 tokens
  {
    address: "0x0000000000000000000000000000000000000001",
    votingPower: "0",
    lastChangeBlock: 500,
  }, // 0 tokens
];

describe("filterDelegates", () => {
  describe("no filters", () => {
    it("returns all delegates when no filters are applied", () => {
      const result = filterDelegates(mockDelegates, {});
      expect(result).toEqual(mockDelegates);
      expect(result.length).toBe(5);
    });

    it("returns empty array for empty input", () => {
      const result = filterDelegates([], {});
      expect(result).toEqual([]);
    });
  });

  describe("minVotingPower filter", () => {
    it("filters delegates below minimum voting power", () => {
      const result = filterDelegates(mockDelegates, {
        minVotingPower: "100000000000000000000", // 100 tokens
      });
      expect(result.length).toBe(3);
      expect(result.map((d) => d.address)).toEqual([
        "0x1234567890abcdef1234567890abcdef12345678",
        "0xabcdef1234567890abcdef1234567890abcdef12",
        "0x9876543210fedcba9876543210fedcba98765432",
      ]);
    });

    it("includes delegates with exactly minimum voting power", () => {
      const result = filterDelegates(mockDelegates, {
        minVotingPower: "500000000000000000000", // exactly 500 tokens
      });
      expect(result.length).toBe(2);
      expect(
        result.some((d) => d.votingPower === "500000000000000000000")
      ).toBe(true);
    });

    it("returns empty when min is higher than all delegates", () => {
      const result = filterDelegates(mockDelegates, {
        minVotingPower: "10000000000000000000000", // 10000 tokens
      });
      expect(result.length).toBe(0);
    });

    it("returns all when min is 0", () => {
      const result = filterDelegates(mockDelegates, {
        minVotingPower: "0",
      });
      expect(result.length).toBe(5);
    });
  });

  describe("addressFilter filter", () => {
    it("filters by address substring (case insensitive)", () => {
      const result = filterDelegates(mockDelegates, {
        addressFilter: "dead",
      });
      expect(result.length).toBe(1);
      expect(result[0].address).toBe(
        "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef"
      );
    });

    it("filters by address with 0x prefix", () => {
      const result = filterDelegates(mockDelegates, {
        addressFilter: "0x1234",
      });
      expect(result.length).toBe(1);
      expect(result[0].address).toBe(
        "0x1234567890abcdef1234567890abcdef12345678"
      );
    });

    it("is case insensitive", () => {
      const result1 = filterDelegates(mockDelegates, {
        addressFilter: "ABCDEF",
      });
      const result2 = filterDelegates(mockDelegates, {
        addressFilter: "abcdef",
      });
      expect(result1).toEqual(result2);
    });

    it("trims whitespace", () => {
      const result = filterDelegates(mockDelegates, {
        addressFilter: "  dead  ",
      });
      expect(result.length).toBe(1);
    });

    it("returns all for empty string filter", () => {
      const result = filterDelegates(mockDelegates, {
        addressFilter: "",
      });
      expect(result.length).toBe(5);
    });

    it("returns all for whitespace-only filter", () => {
      const result = filterDelegates(mockDelegates, {
        addressFilter: "   ",
      });
      expect(result.length).toBe(5);
    });

    it("returns empty for no matches", () => {
      const result = filterDelegates(mockDelegates, {
        addressFilter: "xyz123",
      });
      expect(result.length).toBe(0);
    });
  });

  describe("combined filters", () => {
    it("applies both minVotingPower and addressFilter", () => {
      const result = filterDelegates(mockDelegates, {
        minVotingPower: "100000000000000000000", // 100 tokens
        addressFilter: "abcdef",
      });
      // Should match: 0x1234...abcdef... (1000 tokens) and 0xabcdef... (500 tokens)
      expect(result.length).toBe(2);
    });

    it("returns empty when filters are mutually exclusive", () => {
      const result = filterDelegates(mockDelegates, {
        minVotingPower: "1000000000000000000000", // 1000 tokens - only first delegate
        addressFilter: "dead", // only deadbeef address which has 50 tokens
      });
      expect(result.length).toBe(0);
    });
  });
});

describe("sortDelegatesByVotingPower", () => {
  it("sorts by voting power descending", () => {
    const shuffled: DelegateInfo[] = [
      mockDelegates[3], // 50
      mockDelegates[0], // 1000
      mockDelegates[4], // 0
      mockDelegates[2], // 100
      mockDelegates[1], // 500
    ];
    const result = sortDelegatesByVotingPower(shuffled);
    expect(result.map((d) => d.votingPower)).toEqual([
      "1000000000000000000000",
      "500000000000000000000",
      "100000000000000000000",
      "50000000000000000000",
      "0",
    ]);
  });

  it("compares numerically, not lexicographically", () => {
    // Lexicographic sort would put "9..." (19 digits) before "10..." (22 digits).
    const delegates: DelegateInfo[] = [
      {
        address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        votingPower: "9000000000000000000", // 9 tokens (19 chars)
        lastChangeBlock: 1,
      },
      {
        address: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        votingPower: "1000000000000000000000", // 1000 tokens (22 chars)
        lastChangeBlock: 2,
      },
    ];
    const result = sortDelegatesByVotingPower(delegates);
    expect(result[0].votingPower).toBe("1000000000000000000000");
    expect(result[1].votingPower).toBe("9000000000000000000");
  });

  it("does not mutate the input array", () => {
    const input = [...mockDelegates];
    const snapshot = [...input];
    sortDelegatesByVotingPower(input);
    expect(input).toEqual(snapshot);
  });

  it("returns empty array for empty input", () => {
    expect(sortDelegatesByVotingPower([])).toEqual([]);
  });

  it("handles equal voting powers without dropping entries", () => {
    const delegates: DelegateInfo[] = [
      {
        address: "0x1111111111111111111111111111111111111111",
        votingPower: "100",
        lastChangeBlock: 1,
      },
      {
        address: "0x2222222222222222222222222222222222222222",
        votingPower: "100",
        lastChangeBlock: 2,
      },
      {
        address: "0x3333333333333333333333333333333333333333",
        votingPower: "200",
        lastChangeBlock: 3,
      },
    ];
    const result = sortDelegatesByVotingPower(delegates);
    expect(result).toHaveLength(3);
    expect(result[0].votingPower).toBe("200");
  });

  it("re-sorts after voting powers are mutated (post-refresh regression)", () => {
    // Simulates refreshVisibleDelegates updating votingPower in place: an
    // initially top-ranked delegate drops to the bottom after a refresh, so
    // the original input order is no longer voting-power-descending.
    const refreshed: DelegateInfo[] = [
      { ...mockDelegates[0], votingPower: "1" }, // was 1000, now 1
      mockDelegates[1], // 500
      mockDelegates[2], // 100
      mockDelegates[3], // 50
      mockDelegates[4], // 0
    ];
    const result = sortDelegatesByVotingPower(refreshed);
    expect(result.map((d) => d.votingPower)).toEqual([
      "500000000000000000000",
      "100000000000000000000",
      "50000000000000000000",
      "1",
      "0",
    ]);
  });
});
