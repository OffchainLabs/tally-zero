import { describe, expect, it } from "vitest";

import type { DelegateCache, DelegateInfo } from "@/types/delegate";

import {
  findDelegateByAddress,
  getDelegateCacheStats,
  getDelegateLabel,
  getDelegatesWithMinPower,
  getTopDelegates,
} from "./delegate-cache";

// Mock cache data for testing
const createMockDelegate = (
  address: `0x${string}`,
  votingPower: string
): DelegateInfo => ({
  address,
  votingPower,
  lastChangeBlock: 100000000,
});

const createMockCache = (delegates: DelegateInfo[]): DelegateCache => ({
  version: 1,
  generatedAt: "2024-01-15T12:00:00Z",
  snapshotBlock: 100000000,
  startBlock: 70398215,
  chainId: 42161,
  totalVotingPower: "1000000000000000000000000",
  totalSupply: "10000000000000000000000000000",
  delegates,
  stats: {
    totalDelegates: delegates.length,
    eventsProcessed: 50000,
  },
});

describe("delegate-cache", () => {
  describe("getDelegateLabel", () => {
    it("returns undefined for unknown addresses", () => {
      expect(
        getDelegateLabel("0x0000000000000000000000000000000000000001")
      ).toBeUndefined();
    });

    it("handles case-insensitive lookup", () => {
      // This depends on delegate-labels.json content
      // Just verify it doesn't crash with different case inputs
      const lowerAddress = "0xabcdef1234567890abcdef1234567890abcdef12";
      const upperAddress = "0xABCDEF1234567890ABCDEF1234567890ABCDEF12";
      // Both should return the same result (undefined for unknown)
      expect(getDelegateLabel(lowerAddress)).toBe(
        getDelegateLabel(upperAddress)
      );
    });
  });

  describe("getDelegateCacheStats", () => {
    it("returns correct stats from cache", () => {
      const delegates = [
        createMockDelegate(
          "0x1111111111111111111111111111111111111111",
          "1000"
        ),
        createMockDelegate("0x2222222222222222222222222222222222222222", "500"),
      ];
      const cache = createMockCache(delegates);

      const stats = getDelegateCacheStats(cache);

      expect(stats.totalDelegates).toBe(2);
      expect(stats.snapshotBlock).toBe(100000000);
      expect(stats.generatedAt).toBeInstanceOf(Date);
      expect(stats.totalVotingPower).toBe("1000000000000000000000000");
      expect(stats.totalSupply).toBe("10000000000000000000000000000");
      expect(stats.age).toBeDefined();
    });

    it("formats age correctly", () => {
      const cache = createMockCache([]);
      const stats = getDelegateCacheStats(cache);

      // Age should be a string like "1d 2h" or similar
      expect(typeof stats.age).toBe("string");
      expect(stats.age.length).toBeGreaterThan(0);
    });
  });

  describe("getTopDelegates", () => {
    it("returns limited number of delegates", () => {
      const delegates = Array.from({ length: 50 }, (_, i) =>
        createMockDelegate(
          `0x${i.toString(16).padStart(40, "0")}`,
          (50 - i).toString()
        )
      );
      const cache = createMockCache(delegates);

      expect(getTopDelegates(cache, 10)).toHaveLength(10);
      expect(getTopDelegates(cache, 5)).toHaveLength(5);
    });

    it("returns all delegates when limit exceeds count", () => {
      const delegates = [
        createMockDelegate(
          "0x1111111111111111111111111111111111111111",
          "1000"
        ),
        createMockDelegate("0x2222222222222222222222222222222222222222", "500"),
      ];
      const cache = createMockCache(delegates);

      expect(getTopDelegates(cache, 100)).toHaveLength(2);
    });

    it("uses default limit of 100", () => {
      const delegates = Array.from({ length: 150 }, (_, i) =>
        createMockDelegate(
          `0x${i.toString(16).padStart(40, "0")}`,
          (150 - i).toString()
        )
      );
      const cache = createMockCache(delegates);

      expect(getTopDelegates(cache)).toHaveLength(100);
    });

    it("returns empty array for empty cache", () => {
      const cache = createMockCache([]);
      expect(getTopDelegates(cache)).toHaveLength(0);
    });
  });

  describe("findDelegateByAddress", () => {
    const delegates = [
      createMockDelegate("0x1111111111111111111111111111111111111111", "1000"),
      createMockDelegate("0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", "500"),
      createMockDelegate("0xBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBb", "250"),
    ];
    const cache = createMockCache(delegates);

    it("finds delegate by exact address", () => {
      const result = findDelegateByAddress(
        cache,
        "0x1111111111111111111111111111111111111111"
      );
      expect(result).toBeDefined();
      expect(result?.votingPower).toBe("1000");
    });

    it("handles case-insensitive address matching", () => {
      const lowercase = findDelegateByAddress(
        cache,
        "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      );
      const uppercase = findDelegateByAddress(
        cache,
        "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
      );
      const mixed = findDelegateByAddress(
        cache,
        "0xAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAa"
      );

      expect(lowercase).toBeDefined();
      expect(uppercase).toBeDefined();
      expect(mixed).toBeDefined();
      expect(lowercase?.votingPower).toBe("500");
      expect(uppercase?.votingPower).toBe("500");
      expect(mixed?.votingPower).toBe("500");
    });

    it("returns undefined for non-existent address", () => {
      const result = findDelegateByAddress(
        cache,
        "0x9999999999999999999999999999999999999999"
      );
      expect(result).toBeUndefined();
    });

    it("handles empty cache", () => {
      const emptyCache = createMockCache([]);
      const result = findDelegateByAddress(
        emptyCache,
        "0x1111111111111111111111111111111111111111"
      );
      expect(result).toBeUndefined();
    });
  });

  describe("getDelegatesWithMinPower", () => {
    const delegates = [
      createMockDelegate("0x1111111111111111111111111111111111111111", "1000"),
      createMockDelegate("0x2222222222222222222222222222222222222222", "500"),
      createMockDelegate("0x3333333333333333333333333333333333333333", "250"),
      createMockDelegate("0x4444444444444444444444444444444444444444", "100"),
    ];
    const cache = createMockCache(delegates);

    it("filters delegates with minimum power", () => {
      const result = getDelegatesWithMinPower(cache, "500");
      expect(result).toHaveLength(2);
      expect(result.map((d) => d.votingPower)).toEqual(["1000", "500"]);
    });

    it("returns all delegates when min is 0", () => {
      const result = getDelegatesWithMinPower(cache, "0");
      expect(result).toHaveLength(4);
    });

    it("returns empty array when min exceeds all", () => {
      const result = getDelegatesWithMinPower(cache, "2000");
      expect(result).toHaveLength(0);
    });

    it("handles large BigInt values", () => {
      const bigDelegates = [
        createMockDelegate(
          "0x1111111111111111111111111111111111111111",
          "1000000000000000000000000"
        ), // 1e24
        createMockDelegate(
          "0x2222222222222222222222222222222222222222",
          "500000000000000000000000"
        ), // 5e23
        createMockDelegate(
          "0x3333333333333333333333333333333333333333",
          "100000000000000000000000"
        ), // 1e23
      ];
      const bigCache = createMockCache(bigDelegates);

      const result = getDelegatesWithMinPower(
        bigCache,
        "500000000000000000000000"
      );
      expect(result).toHaveLength(2);
    });

    it("handles empty cache", () => {
      const emptyCache = createMockCache([]);
      const result = getDelegatesWithMinPower(emptyCache, "100");
      expect(result).toHaveLength(0);
    });
  });
});
