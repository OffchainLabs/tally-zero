/**
 * Tests for stage-utils component utilities
 */

import { describe, expect, it } from "vitest";

import {
  getStageTxExplorerUrl,
  parseEstimatedDurationRange,
  VOTING_EXTENSION_DAYS,
} from "./stage-utils";

describe("getStageTxExplorerUrl", () => {
  const testHash =
    "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";

  it("returns Etherscan URL for ethereum chain", () => {
    const url = getStageTxExplorerUrl(testHash, "ethereum");
    expect(url).toBe(`https://etherscan.io/tx/${testHash}`);
  });

  it("returns Arbiscan URL for arb1 chain", () => {
    const url = getStageTxExplorerUrl(testHash, "arb1");
    expect(url).toBe(`https://arbiscan.io/tx/${testHash}`);
  });

  it("returns Nova Arbiscan URL for nova chain", () => {
    const url = getStageTxExplorerUrl(testHash, "nova");
    expect(url).toBe(`https://nova.arbiscan.io/tx/${testHash}`);
  });

  it("uses targetChain when provided", () => {
    const url = getStageTxExplorerUrl(testHash, "ethereum", "nova");
    expect(url).toBe(`https://nova.arbiscan.io/tx/${testHash}`);
  });
});

describe("parseEstimatedDurationRange", () => {
  describe("range format", () => {
    it("parses range with days (e.g., '14-16 days')", () => {
      const result = parseEstimatedDurationRange("14-16 days");
      expect(result).toEqual({ min: 14, max: 16 });
    });

    it("parses range with day singular (e.g., '1-2 day')", () => {
      const result = parseEstimatedDurationRange("1-2 day");
      expect(result).toEqual({ min: 1, max: 2 });
    });

    it("parses range with ~ prefix", () => {
      const result = parseEstimatedDurationRange("~7-10 days");
      expect(result).toEqual({ min: 7, max: 10 });
    });

    it("parses range with leading/trailing whitespace", () => {
      const result = parseEstimatedDurationRange("  3-5 days  ");
      expect(result).toEqual({ min: 3, max: 5 });
    });
  });

  describe("single value format", () => {
    it("parses single day value (e.g., '3 days')", () => {
      const result = parseEstimatedDurationRange("3 days");
      expect(result).toEqual({ min: 3, max: 3 });
    });

    it("parses single day value (e.g., '1 day')", () => {
      const result = parseEstimatedDurationRange("1 day");
      expect(result).toEqual({ min: 1, max: 1 });
    });

    it("parses single value with ~ prefix", () => {
      const result = parseEstimatedDurationRange("~8 days");
      expect(result).toEqual({ min: 8, max: 8 });
    });
  });

  describe("edge cases", () => {
    it("returns zeros for undefined input", () => {
      const result = parseEstimatedDurationRange(undefined);
      expect(result).toEqual({ min: 0, max: 0 });
    });

    it("returns zeros for empty string", () => {
      const result = parseEstimatedDurationRange("");
      expect(result).toEqual({ min: 0, max: 0 });
    });

    it("returns zeros for invalid format", () => {
      const result = parseEstimatedDurationRange("soon");
      expect(result).toEqual({ min: 0, max: 0 });
    });

    it("returns zeros for hours (not supported)", () => {
      const result = parseEstimatedDurationRange("24 hours");
      expect(result).toEqual({ min: 0, max: 0 });
    });
  });
});

describe("VOTING_EXTENSION_DAYS constant", () => {
  it("is 2 days (Arbitrum voting extension period)", () => {
    expect(VOTING_EXTENSION_DAYS).toBe(2);
  });
});
