import { describe, expect, it } from "vitest";

import { DELEGATE_MIN_VOTING_POWER_WEI } from "@/config/delegates";
import type { DelegateCache, DelegateInfo } from "@/types/delegate";

import {
  delegateMatchesSearch,
  getDelegateCacheStats,
  getDelegateLabel,
  getTopDelegates,
  stripExcludedDelegates,
  type TallyDelegateListItem,
} from "./delegate-cache";

const ELIGIBLE_VOTING_POWER = DELEGATE_MIN_VOTING_POWER_WEI;
const INELIGIBLE_VOTING_POWER = (
  BigInt(DELEGATE_MIN_VOTING_POWER_WEI) - BigInt(1)
).toString();

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
  describe("getDelegateLabel", () => {
    it("returns undefined for unknown addresses", () => {
      expect(
        getDelegateLabel("0x0000000000000000000000000000000000000001")
      ).toBeUndefined();
    });

    it("handles case-insensitive lookup", () => {
      const lowerAddress = "0xabcdef1234567890abcdef1234567890abcdef12";
      const upperAddress = "0xABCDEF1234567890ABCDEF1234567890ABCDEF12";
      expect(getDelegateLabel(lowerAddress)).toBe(
        getDelegateLabel(upperAddress)
      );
    });
  });

  describe("delegateMatchesSearch", () => {
    it("matches delegate display metadata", () => {
      const delegate: TallyDelegateListItem = {
        address: "0x1234567890abcdef1234567890abcdef12345678",
        votingPower: "1000",
        lastChangeBlock: 100,
        votesCount: "1000",
        delegatorsCount: 1,
        isPrioritized: false,
        ens: "example.eth",
        name: "Example Delegate",
        picture: null,
        knownLabel: "Known Delegate",
        displayName: "Known Delegate",
      };

      expect(delegateMatchesSearch(delegate, "known")).toBe(true);
      expect(delegateMatchesSearch(delegate, "example.eth")).toBe(true);
      expect(delegateMatchesSearch(delegate, "nomatch")).toBe(false);
    });
  });

  describe("getDelegateCacheStats", () => {
    it("returns correct stats from cache", () => {
      const delegates = [
        createMockDelegate(
          "0x1111111111111111111111111111111111111111",
          ELIGIBLE_VOTING_POWER
        ),
        createMockDelegate(
          "0x2222222222222222222222222222222222222222",
          ELIGIBLE_VOTING_POWER
        ),
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

    it("counts only delegates that meet the eligibility threshold", () => {
      // The SDK builds the cache with a lower floor of its own, so its
      // stats.totalDelegates over-counts by this app's rule.
      const cache = createMockCache([
        createMockDelegate(
          "0x1111111111111111111111111111111111111111",
          ELIGIBLE_VOTING_POWER
        ),
        createMockDelegate(
          "0x2222222222222222222222222222222222222222",
          INELIGIBLE_VOTING_POWER
        ),
        createMockDelegate("0x00000000000000000000000000000000000a4b86", "1"),
      ]);

      expect(cache.stats.totalDelegates).toBe(3);
      expect(getDelegateCacheStats(cache).totalDelegates).toBe(1);
    });

    it("formats age correctly", () => {
      const cache = createMockCache([]);
      const stats = getDelegateCacheStats(cache);

      // Age should be a string like "1d 2h" or similar
      expect(typeof stats.age).toBe("string");
      expect(stats.age.length).toBeGreaterThan(0);
    });
  });

  describe("stripExcludedDelegates", () => {
    const createListItem = (
      address: `0x${string}`,
      votingPower: string
    ): TallyDelegateListItem => ({
      address,
      votingPower,
      lastChangeBlock: 100,
      votesCount: votingPower,
      delegatorsCount: 1,
      isPrioritized: false,
      ens: null,
      name: null,
      picture: null,
      knownLabel: null,
      displayName: null,
    });

    const EXCLUDE_ADDRESS = "0x00000000000000000000000000000000000a4b86";

    it("removes the exclude address and subtracts its voting power", () => {
      const result = stripExcludedDelegates({
        delegates: [
          createListItem(EXCLUDE_ADDRESS, "700"),
          createListItem("0x1111111111111111111111111111111111111111", "300"),
        ],
        totalVotingPower: "1000",
        totalSupply: "2000",
      });

      expect(result.delegates).toHaveLength(1);
      expect(result.delegates[0].address).toBe(
        "0x1111111111111111111111111111111111111111"
      );
      expect(result.totalVotingPower).toBe("300");
      expect(result.totalSupply).toBe("2000");
    });

    it("matches the exclude address case-insensitively", () => {
      const result = stripExcludedDelegates({
        delegates: [
          createListItem("0x00000000000000000000000000000000000A4B86", "700"),
        ],
        totalVotingPower: "700",
        totalSupply: "2000",
      });

      expect(result.delegates).toHaveLength(0);
      expect(result.totalVotingPower).toBe("0");
    });

    it("returns the list unchanged when the exclude address is absent", () => {
      const list = {
        delegates: [
          createListItem("0x1111111111111111111111111111111111111111", "300"),
        ],
        totalVotingPower: "300",
        totalSupply: "2000",
      };

      expect(stripExcludedDelegates(list)).toBe(list);
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
