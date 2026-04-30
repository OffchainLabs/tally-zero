import { describe, expect, it } from "vitest";

import type { DelegateCache, DelegateInfo } from "@/types/delegate";

import { getDelegateCacheStats, getTopDelegates } from "./delegate-cache";

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
  },
});

describe("delegate-cache", () => {
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
});
