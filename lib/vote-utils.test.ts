import { describe, expect, it } from "vitest";

import {
  calculateQuorumProgress,
  calculateVoteDistribution,
} from "./vote-utils";

describe("vote-utils", () => {
  describe("calculateVoteDistribution", () => {
    it("calculates percentages correctly", () => {
      const result = calculateVoteDistribution("50", "30", "20");
      expect(result.forPct).toBe(50);
      expect(result.againstPct).toBe(30);
      expect(result.abstainPct).toBe(20);
      expect(result.total).toBe(100);
      expect(result.hasVotes).toBe(true);
    });

    it("handles zero total votes", () => {
      const result = calculateVoteDistribution("0", "0", "0");
      expect(result.forPct).toBe(0);
      expect(result.againstPct).toBe(0);
      expect(result.abstainPct).toBe(0);
      expect(result.total).toBe(0);
      expect(result.hasVotes).toBe(false);
    });

    it("handles empty strings", () => {
      const result = calculateVoteDistribution("", "", "");
      expect(result.hasVotes).toBe(false);
    });

    it("handles invalid strings", () => {
      const result = calculateVoteDistribution("abc", "def", "ghi");
      expect(result.hasVotes).toBe(false);
    });

    it("handles large numbers", () => {
      const result = calculateVoteDistribution(
        "1000000000",
        "500000000",
        "500000000"
      );
      expect(result.forPct).toBe(50);
      expect(result.againstPct).toBe(25);
      expect(result.abstainPct).toBe(25);
      expect(result.total).toBe(2000000000);
      expect(result.hasVotes).toBe(true);
    });

    it("handles decimal values", () => {
      const result = calculateVoteDistribution("33.33", "33.33", "33.34");
      expect(result.total).toBeCloseTo(100);
      expect(result.forPct).toBeCloseTo(33.33);
    });

    it("calculates uneven distributions", () => {
      const result = calculateVoteDistribution("100", "0", "0");
      expect(result.forPct).toBe(100);
      expect(result.againstPct).toBe(0);
      expect(result.abstainPct).toBe(0);
    });
  });

  describe("calculateQuorumProgress", () => {
    it("calculates percentage correctly", () => {
      const result = calculateQuorumProgress("50", "100");
      expect(result.percentage).toBe(50);
      expect(result.isReached).toBe(false);
      expect(result.current).toBe(50);
      expect(result.required).toBe(100);
    });

    it("detects quorum reached", () => {
      const result = calculateQuorumProgress("100", "100");
      expect(result.percentage).toBe(100);
      expect(result.isReached).toBe(true);
    });

    it("detects quorum exceeded", () => {
      const result = calculateQuorumProgress("150", "100");
      expect(result.percentage).toBe(100); // Capped at 100
      expect(result.isReached).toBe(true);
    });

    it("handles zero required", () => {
      const result = calculateQuorumProgress("50", "0");
      expect(result.percentage).toBe(0);
      expect(result.isReached).toBe(false);
    });

    it("handles empty strings", () => {
      const result = calculateQuorumProgress("", "");
      expect(result.current).toBe(0);
      expect(result.required).toBe(0);
    });

    it("respects reachedOverride=true", () => {
      const result = calculateQuorumProgress("10", "100", true);
      expect(result.percentage).toBe(10);
      expect(result.isReached).toBe(true); // Override wins
    });

    it("respects reachedOverride=false", () => {
      const result = calculateQuorumProgress("100", "100", false);
      expect(result.percentage).toBe(100);
      expect(result.isReached).toBe(false); // Override wins
    });

    it("handles large numbers", () => {
      const result = calculateQuorumProgress("5000000000", "10000000000");
      expect(result.percentage).toBe(50);
    });
  });
});
