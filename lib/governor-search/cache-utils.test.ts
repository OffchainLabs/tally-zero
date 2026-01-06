/**
 * Tests for governor-search cache-utils
 */

import type { ProposalCache } from "@/lib/proposal-cache";
import { describe, expect, it } from "vitest";

import { calculateSearchRanges } from "./cache-utils";

// Helper to create a minimal cache for testing
function createMockCache(
  startBlock: number,
  snapshotBlock: number
): ProposalCache {
  return {
    version: 1,
    generatedAt: "2024-01-01T00:00:00Z",
    snapshotBlock,
    startBlock,
    chainId: 42161,
    proposals: [],
    governorStats: {},
  };
}

describe("calculateSearchRanges", () => {
  describe("no cache scenarios", () => {
    it("returns full RPC range when cache is null", () => {
      const result = calculateSearchRanges(1000, 2000, null, false);

      expect(result.rpcRanges).toEqual([{ start: 1000, end: 2000 }]);
      expect(result.useCache).toBe(false);
      expect(result.rangeInfo).toContain("No cache available");
    });

    it("returns full RPC range when skipCache is true", () => {
      const cache = createMockCache(500, 1500);
      const result = calculateSearchRanges(1000, 2000, cache, true);

      expect(result.rpcRanges).toEqual([{ start: 1000, end: 2000 }]);
      expect(result.useCache).toBe(false);
      expect(result.rangeInfo).toContain("Cache skipped");
    });
  });

  describe("user range entirely after cache", () => {
    it("returns RPC range for new blocks", () => {
      const cache = createMockCache(100, 500);
      const result = calculateSearchRanges(600, 1000, cache, false);

      expect(result.rpcRanges).toEqual([{ start: 600, end: 1000 }]);
      expect(result.useCache).toBe(false);
      expect(result.rangeInfo).toContain("Searching new blocks");
    });

    it("handles range starting exactly at cache end + 1", () => {
      const cache = createMockCache(100, 500);
      const result = calculateSearchRanges(501, 1000, cache, false);

      expect(result.rpcRanges).toEqual([{ start: 501, end: 1000 }]);
      expect(result.useCache).toBe(false);
    });
  });

  describe("user range entirely within cache (full cache hit)", () => {
    it("returns empty RPC ranges and uses cache", () => {
      const cache = createMockCache(100, 1000);
      const result = calculateSearchRanges(200, 800, cache, false);

      expect(result.rpcRanges).toEqual([]);
      expect(result.useCache).toBe(true);
      expect(result.cacheFilter).toEqual({ minBlock: 200, maxBlock: 800 });
      expect(result.rangeInfo).toContain("Full cache hit");
    });

    it("handles exact cache boundaries", () => {
      const cache = createMockCache(100, 1000);
      const result = calculateSearchRanges(100, 1000, cache, false);

      expect(result.rpcRanges).toEqual([]);
      expect(result.useCache).toBe(true);
      expect(result.cacheFilter).toEqual({ minBlock: 100, maxBlock: 1000 });
    });
  });

  describe("partial cache hit scenarios", () => {
    it("handles user range extending beyond cache end", () => {
      const cache = createMockCache(100, 500);
      const result = calculateSearchRanges(200, 800, cache, false);

      expect(result.rpcRanges).toEqual([{ start: 501, end: 800 }]);
      expect(result.useCache).toBe(true);
      expect(result.cacheFilter).toEqual({ minBlock: 200, maxBlock: 500 });
      expect(result.rangeInfo).toContain("Partial cache hit");
    });

    it("handles user range starting before cache start", () => {
      const cache = createMockCache(500, 1000);
      const result = calculateSearchRanges(200, 800, cache, false);

      expect(result.rpcRanges).toEqual([{ start: 200, end: 499 }]);
      expect(result.useCache).toBe(true);
      expect(result.cacheFilter).toEqual({ minBlock: 500, maxBlock: 800 });
    });

    it("handles user range spanning entire cache with extensions", () => {
      const cache = createMockCache(500, 1000);
      const result = calculateSearchRanges(200, 1500, cache, false);

      expect(result.rpcRanges).toHaveLength(2);
      expect(result.rpcRanges).toContainEqual({ start: 200, end: 499 });
      expect(result.rpcRanges).toContainEqual({ start: 1001, end: 1500 });
      expect(result.useCache).toBe(true);
      expect(result.cacheFilter).toEqual({ minBlock: 500, maxBlock: 1000 });
    });
  });
});
