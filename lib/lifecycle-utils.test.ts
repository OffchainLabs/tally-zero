import { describe, expect, it } from "vitest";
import {
  formatCurrentState,
  formatStageName,
  getStateStyle,
} from "./lifecycle-utils";

describe("lifecycle-utils", () => {
  describe("formatStageName", () => {
    it("converts PROPOSAL_CREATED to Proposal Created", () => {
      expect(formatStageName("PROPOSAL_CREATED")).toBe("Proposal Created");
    });

    it("converts VOTING_ACTIVE to Voting Active", () => {
      expect(formatStageName("VOTING_ACTIVE")).toBe("Voting Active");
    });

    it("converts PROPOSAL_QUEUED to Proposal Queued", () => {
      expect(formatStageName("PROPOSAL_QUEUED")).toBe("Proposal Queued");
    });

    it("converts L2_TIMELOCK to L2 Timelock", () => {
      expect(formatStageName("L2_TIMELOCK")).toBe("L2 Timelock");
    });

    it("converts L2_TO_L1_MESSAGE to L2→L1 Message", () => {
      expect(formatStageName("L2_TO_L1_MESSAGE")).toBe("L2→L1 Message");
    });

    it("converts L1_TIMELOCK to L1 Timelock", () => {
      expect(formatStageName("L1_TIMELOCK")).toBe("L1 Timelock");
    });

    it("converts RETRYABLE_EXECUTED to Retryable Executed", () => {
      expect(formatStageName("RETRYABLE_EXECUTED")).toBe("Retryable Executed");
    });
  });

  describe("formatCurrentState", () => {
    it("returns Unknown for null", () => {
      expect(formatCurrentState(null)).toBe("Unknown");
    });

    it("formats active state", () => {
      expect(formatCurrentState("active")).toBe("Active");
      expect(formatCurrentState("Active")).toBe("Active");
      expect(formatCurrentState("ACTIVE")).toBe("Active");
    });

    it("formats pending state", () => {
      expect(formatCurrentState("pending")).toBe("Pending");
      expect(formatCurrentState("Pending")).toBe("Pending");
    });

    it("formats succeeded as Passed", () => {
      expect(formatCurrentState("succeeded")).toBe("Passed");
      expect(formatCurrentState("Succeeded")).toBe("Passed");
    });

    it("formats executed state", () => {
      expect(formatCurrentState("executed")).toBe("Executed");
      expect(formatCurrentState("Executed")).toBe("Executed");
    });

    it("formats defeated state", () => {
      expect(formatCurrentState("defeated")).toBe("Defeated");
    });

    it("formats queued state", () => {
      expect(formatCurrentState("queued")).toBe("Queued");
    });

    it("formats canceled state", () => {
      expect(formatCurrentState("canceled")).toBe("Canceled");
    });

    it("formats expired state", () => {
      expect(formatCurrentState("expired")).toBe("Expired");
    });

    it("returns original for unknown states", () => {
      expect(formatCurrentState("unknown_state")).toBe("unknown_state");
    });
  });

  describe("getStateStyle", () => {
    it("returns green check for executed", () => {
      const style = getStateStyle("executed");
      expect(style.icon).toBe("check");
      expect(style.color).toBe("text-green-600 dark:text-green-400");
    });

    it("returns green check for Executed (case insensitive)", () => {
      const style = getStateStyle("Executed");
      expect(style.icon).toBe("check");
      expect(style.color).toBe("text-green-600 dark:text-green-400");
    });

    it("returns blue reload for active", () => {
      const style = getStateStyle("active");
      expect(style.icon).toBe("reload");
      expect(style.color).toBe("text-blue-600 dark:text-blue-400");
    });

    it("returns blue reload for pending", () => {
      const style = getStateStyle("pending");
      expect(style.icon).toBe("reload");
      expect(style.color).toBe("text-blue-600 dark:text-blue-400");
    });

    it("returns yellow clock for queued", () => {
      const style = getStateStyle("queued");
      expect(style.icon).toBe("clock");
      expect(style.color).toBe("text-yellow-600 dark:text-yellow-400");
    });

    it("returns yellow clock for succeeded", () => {
      const style = getStateStyle("succeeded");
      expect(style.icon).toBe("clock");
      expect(style.color).toBe("text-yellow-600 dark:text-yellow-400");
    });

    it("returns red cross for defeated", () => {
      const style = getStateStyle("defeated");
      expect(style.icon).toBe("cross");
      expect(style.color).toBe("text-red-600 dark:text-red-400");
    });

    it("returns red cross for canceled", () => {
      const style = getStateStyle("canceled");
      expect(style.icon).toBe("cross");
      expect(style.color).toBe("text-red-600 dark:text-red-400");
    });

    it("returns red cross for expired", () => {
      const style = getStateStyle("expired");
      expect(style.icon).toBe("cross");
      expect(style.color).toBe("text-red-600 dark:text-red-400");
    });

    it("returns muted clock for null", () => {
      const style = getStateStyle(null);
      expect(style.icon).toBe("clock");
      expect(style.color).toBe("text-muted-foreground");
    });

    it("returns muted clock for unknown states", () => {
      const style = getStateStyle("unknown");
      expect(style.icon).toBe("clock");
      expect(style.color).toBe("text-muted-foreground");
    });
  });
});
