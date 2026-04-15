import { describe, expect, it } from "vitest";

import {
  calculatePreciseQuorumProgress,
  calculateQuorumProgress,
  calculateVoteDistribution,
  formatVotes,
  sumVoteCounts,
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

  describe("sumVoteCounts", () => {
    it("adds for and abstain votes with bigint precision", () => {
      expect(sumVoteCounts("1000000000000000000", "2500000000000000000")).toBe(
        "3500000000000000000"
      );
    });

    it("treats invalid values as zero", () => {
      expect(sumVoteCounts("100", "abc", undefined)).toBe("100");
    });
  });

  describe("calculatePreciseQuorumProgress", () => {
    it("calculates the full percentage and clamped bar progress", () => {
      const result = calculatePreciseQuorumProgress("125", "100");

      expect(result.percentage).toBe(125);
      expect(result.progressPercentage).toBe(100);
      expect(result.isReached).toBe(true);
    });

    it("keeps one decimal place of precision for display", () => {
      const result = calculatePreciseQuorumProgress("1", "3");

      expect(result.percentage).toBeCloseTo(33.3, 1);
      expect(result.progressPercentage).toBeCloseTo(33.3, 1);
      expect(result.isReached).toBe(false);
    });

    it("handles zero quorum safely", () => {
      const result = calculatePreciseQuorumProgress("100", "0");

      expect(result.percentage).toBe(0);
      expect(result.progressPercentage).toBe(0);
      expect(result.isReached).toBe(false);
    });
  });

  describe("formatVotes", () => {
    it("formats ethers BigNumber-like objects to strings", () => {
      const mockVotes = {
        forVotes: { toString: () => "1000000000000000000" },
        againstVotes: { toString: () => "500000000000000000" },
        abstainVotes: { toString: () => "200000000000000000" },
      };

      const result = formatVotes(mockVotes);

      expect(result.forVotes).toBe("1000000000000000000");
      expect(result.againstVotes).toBe("500000000000000000");
      expect(result.abstainVotes).toBe("200000000000000000");
      expect(result.quorum).toBeUndefined();
    });

    it("includes quorum when provided", () => {
      const mockVotes = {
        forVotes: { toString: () => "100" },
        againstVotes: { toString: () => "50" },
        abstainVotes: { toString: () => "25" },
      };

      const result = formatVotes(mockVotes, "1000000000000000000000");

      expect(result.quorum).toBe("1000000000000000000000");
    });

    it("handles zero votes", () => {
      const mockVotes = {
        forVotes: { toString: () => "0" },
        againstVotes: { toString: () => "0" },
        abstainVotes: { toString: () => "0" },
      };

      const result = formatVotes(mockVotes);

      expect(result.forVotes).toBe("0");
      expect(result.againstVotes).toBe("0");
      expect(result.abstainVotes).toBe("0");
    });

    it("works with plain string objects", () => {
      const mockVotes = {
        forVotes: "100",
        againstVotes: "50",
        abstainVotes: "25",
      };

      const result = formatVotes(mockVotes);

      expect(result.forVotes).toBe("100");
      expect(result.againstVotes).toBe("50");
      expect(result.abstainVotes).toBe("25");
    });
  });
});
