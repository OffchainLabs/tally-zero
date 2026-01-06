import { describe, expect, it } from "vitest";

import { MS_PER_DAY, MS_PER_HOUR } from "@/lib/date-utils";

import {
  formatCacheAge,
  formatCompactNumber,
  formatVotingPower,
  shortenAddress,
} from "./format-utils";

describe("format-utils", () => {
  describe("formatVotingPower", () => {
    it("returns 0 for zero value", () => {
      expect(formatVotingPower("0")).toBe("0");
    });

    it("returns 0 for empty string", () => {
      expect(formatVotingPower("")).toBe("0");
    });

    it("formats values less than 1000 correctly", () => {
      // 500 tokens = 500 * 10^18 wei
      expect(formatVotingPower("500000000000000000000")).toBe("500");
      // 1.5 tokens
      expect(formatVotingPower("1500000000000000000")).toBe("1.5");
    });

    it("formats thousands with K suffix", () => {
      // 5000 tokens
      expect(formatVotingPower("5000000000000000000000")).toBe("5K");
      // 1,234 tokens
      expect(formatVotingPower("1234000000000000000000")).toBe("1.23K");
    });

    it("formats millions with M suffix", () => {
      // 1,000,000 tokens
      expect(formatVotingPower("1000000000000000000000000")).toBe("1M");
      // 2,500,000 tokens
      expect(formatVotingPower("2500000000000000000000000")).toBe("2.5M");
      // 12,345,678 tokens
      expect(formatVotingPower("12345678000000000000000000")).toBe("12.35M");
    });

    it("formats billions with B suffix", () => {
      // 1,000,000,000 tokens
      expect(formatVotingPower("1000000000000000000000000000")).toBe("1B");
      // 1,500,000,000 tokens
      expect(formatVotingPower("1500000000000000000000000000")).toBe("1.5B");
    });

    it("removes trailing zeros", () => {
      // 2,000,000 tokens (should be 2M, not 2.00M)
      expect(formatVotingPower("2000000000000000000000000")).toBe("2M");
    });

    it("handles invalid input gracefully", () => {
      expect(formatVotingPower("not-a-number")).toBe("0");
    });

    it("handles bigint input", () => {
      // 5000 tokens as bigint
      expect(formatVotingPower(BigInt("5000000000000000000000"))).toBe("5K");
      // 1,000,000 tokens as bigint
      expect(formatVotingPower(BigInt("1000000000000000000000000"))).toBe("1M");
      // 0n
      expect(formatVotingPower(BigInt(0))).toBe("0");
    });
  });

  describe("shortenAddress", () => {
    const validAddress = "0x1234567890abcdef1234567890abcdef12345678";

    it("shortens valid address with default chars", () => {
      expect(shortenAddress(validAddress)).toBe("0x1234...5678");
    });

    it("shortens address with custom chars", () => {
      expect(shortenAddress(validAddress, 6)).toBe("0x123456...345678");
    });

    it("shortens address with chars=2", () => {
      expect(shortenAddress(validAddress, 2)).toBe("0x12...78");
    });

    it("returns original for empty string", () => {
      expect(shortenAddress("")).toBe("");
    });

    it("returns original for address without 0x prefix", () => {
      expect(shortenAddress("1234567890abcdef1234567890abcdef12345678")).toBe(
        "1234567890abcdef1234567890abcdef12345678"
      );
    });

    it("returns original for short address", () => {
      expect(shortenAddress("0x1234")).toBe("0x1234");
    });

    it("handles very large chars value safely", () => {
      const result = shortenAddress(validAddress, 100);
      // Should clamp to safe value (max 20)
      expect(result).toBe("0x1234567890abcdef1234...567890abcdef12345678");
    });

    it("handles negative chars value safely", () => {
      const result = shortenAddress(validAddress, -5);
      // Should clamp to minimum 1
      expect(result).toBe("0x1...8");
    });
  });

  describe("formatCacheAge", () => {
    it("returns < 1h for recent cache", () => {
      const now = new Date();
      expect(formatCacheAge(now)).toBe("< 1h");
    });

    it("returns hours for cache less than a day old", () => {
      const threeHoursAgo = new Date(Date.now() - 3 * MS_PER_HOUR);
      expect(formatCacheAge(threeHoursAgo)).toBe("3h");
    });

    it("returns days and hours for cache more than a day old", () => {
      const twoDaysFiveHoursAgo = new Date(
        Date.now() - 2 * MS_PER_DAY - 5 * MS_PER_HOUR
      );
      expect(formatCacheAge(twoDaysFiveHoursAgo)).toBe("2d 5h");
    });

    it("accepts string date input", () => {
      const now = new Date();
      expect(formatCacheAge(now.toISOString())).toBe("< 1h");
    });

    it("handles exactly 24 hours", () => {
      const oneDayAgo = new Date(Date.now() - MS_PER_DAY);
      expect(formatCacheAge(oneDayAgo)).toBe("1d 0h");
    });

    it("handles 1 day with extra hours", () => {
      const oneDayThreeHoursAgo = new Date(
        Date.now() - MS_PER_DAY - 3 * MS_PER_HOUR
      );
      expect(formatCacheAge(oneDayThreeHoursAgo)).toBe("1d 3h");
    });
  });

  describe("formatCompactNumber", () => {
    it("returns 0 for zero", () => {
      expect(formatCompactNumber(0)).toBe("0");
    });

    it("returns 0 for NaN", () => {
      expect(formatCompactNumber(NaN)).toBe("0");
      expect(formatCompactNumber("not-a-number")).toBe("0");
    });

    it("formats small numbers without suffix", () => {
      expect(formatCompactNumber(500)).toBe("500");
      expect(formatCompactNumber(123.45)).toBe("123.45");
    });

    it("formats thousands with K suffix", () => {
      expect(formatCompactNumber(1000)).toBe("1K");
      expect(formatCompactNumber(1234)).toBe("1.23K");
      expect(formatCompactNumber(5000)).toBe("5K");
      expect(formatCompactNumber(999999)).toBe("1000K");
    });

    it("formats millions with M suffix", () => {
      expect(formatCompactNumber(1000000)).toBe("1M");
      expect(formatCompactNumber(1500000)).toBe("1.5M");
      expect(formatCompactNumber(12345678)).toBe("12.35M");
    });

    it("formats billions with B suffix", () => {
      expect(formatCompactNumber(1000000000)).toBe("1B");
      expect(formatCompactNumber(1500000000)).toBe("1.5B");
      expect(formatCompactNumber(2500000000)).toBe("2.5B");
    });

    it("trims trailing zeros by default", () => {
      expect(formatCompactNumber(2000000)).toBe("2M");
      expect(formatCompactNumber(1500000)).toBe("1.5M");
      expect(formatCompactNumber(1230000)).toBe("1.23M");
    });

    it("preserves trailing zeros when option is false", () => {
      expect(formatCompactNumber(2000000, { trimTrailingZeros: false })).toBe(
        "2.00M"
      );
      expect(formatCompactNumber(1500000, { trimTrailingZeros: false })).toBe(
        "1.50M"
      );
    });

    it("respects custom decimal places", () => {
      expect(formatCompactNumber(1234567, { decimals: 1 })).toBe("1.2M");
      expect(formatCompactNumber(1234567, { decimals: 3 })).toBe("1.235M");
    });

    it("handles string input", () => {
      expect(formatCompactNumber("1500000")).toBe("1.5M");
      expect(formatCompactNumber("1234")).toBe("1.23K");
    });

    it("handles negative numbers", () => {
      expect(formatCompactNumber(-1500000)).toBe("-1.5M");
      expect(formatCompactNumber(-1234)).toBe("-1.23K");
    });
  });
});
