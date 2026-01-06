/**
 * Tests for use-delegate-search filter utilities
 */

import { describe, expect, it } from "vitest";

import type { DelegateInfo } from "@/types/delegate";

import { filterDelegates } from "./use-delegate-search";

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
