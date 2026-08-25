import { describe, expect, it } from "vitest";

import {
  ADVANCEABLE_PROPOSAL_STATES,
  findStateByValue,
  getStateName,
  IN_FLIGHT_PROPOSAL_STATES,
  normalizeProposalStateName,
} from "./state-utils";

describe("state-utils", () => {
  describe("findStateByValue", () => {
    it("returns state for exact case match", () => {
      const result = findStateByValue("Active");
      expect(result).toBeDefined();
      expect(result?.value).toBe("Active");
      expect(result?.label).toBe("Active");
    });

    it("returns state for lowercase match", () => {
      const result = findStateByValue("active");
      expect(result).toBeDefined();
      expect(result?.value).toBe("Active");
    });

    it("returns state for uppercase match", () => {
      const result = findStateByValue("ACTIVE");
      expect(result).toBeDefined();
      expect(result?.value).toBe("Active");
    });

    it("returns state for mixed case match", () => {
      const result = findStateByValue("aCtIvE");
      expect(result).toBeDefined();
      expect(result?.value).toBe("Active");
    });

    it("returns undefined for unknown state", () => {
      const result = findStateByValue("Unknown");
      expect(result).toBeUndefined();
    });

    it("returns undefined for empty string", () => {
      const result = findStateByValue("");
      expect(result).toBeUndefined();
    });

    it("returns undefined for null", () => {
      const result = findStateByValue(null);
      expect(result).toBeUndefined();
    });

    it("returns undefined for undefined", () => {
      const result = findStateByValue(undefined);
      expect(result).toBeUndefined();
    });

    it("finds all valid states", () => {
      const validStates = [
        "Active",
        "Pending",
        "Queued",
        "Succeeded",
        "Executed",
        "Defeated",
        "Canceled",
        "Expired",
      ];

      for (const state of validStates) {
        const result = findStateByValue(state);
        expect(result).toBeDefined();
        expect(result?.value).toBe(state);
      }
    });

    // The proposal page renders "Unknown proposal state" for anything this
    // does not resolve, so the derived Executing status has to be in the list.
    it("resolves the derived Executing status", () => {
      const result = findStateByValue("Executing");
      expect(result?.value).toBe("Executing");
      expect(result?.label).toBe("Executing");
    });

    it("returns state with all required properties", () => {
      const result = findStateByValue("Active");
      expect(result).toHaveProperty("value");
      expect(result).toHaveProperty("label");
      expect(result).toHaveProperty("bgColor");
      expect(result).toHaveProperty("icon");
    });
  });

  describe("getStateName", () => {
    it("converts state 0 to pending", () => {
      expect(getStateName(0)).toBe("pending");
    });

    it("converts state 1 to active", () => {
      expect(getStateName(1)).toBe("active");
    });

    it("converts state 2 to canceled", () => {
      expect(getStateName(2)).toBe("canceled");
    });

    it("converts state 3 to defeated", () => {
      expect(getStateName(3)).toBe("defeated");
    });

    it("converts state 4 to succeeded", () => {
      expect(getStateName(4)).toBe("succeeded");
    });

    it("converts state 5 to queued", () => {
      expect(getStateName(5)).toBe("queued");
    });

    it("converts state 6 to expired", () => {
      expect(getStateName(6)).toBe("expired");
    });

    it("converts state 7 to executed", () => {
      expect(getStateName(7)).toBe("executed");
    });

    it("returns unknown for invalid state numbers", () => {
      expect(getStateName(8)).toBe("unknown");
      expect(getStateName(-1)).toBe("unknown");
      expect(getStateName(100)).toBe("unknown");
    });
  });

  describe("normalizeProposalStateName", () => {
    it("returns every canonical name unchanged", () => {
      const canonical = [
        "Pending",
        "Active",
        "Canceled",
        "Defeated",
        "Succeeded",
        "Queued",
        "Expired",
        "Executed",
      ];

      for (const state of canonical) {
        expect(normalizeProposalStateName(state)).toBe(state);
      }
    });

    it("capitalizes the lowercase names getStateName produces", () => {
      expect(normalizeProposalStateName(getStateName(1))).toBe("Active");
      expect(normalizeProposalStateName(getStateName(3))).toBe("Defeated");
      expect(normalizeProposalStateName(getStateName(7))).toBe("Executed");
    });

    it("handles arbitrary casing and surrounding whitespace", () => {
      expect(normalizeProposalStateName("ACTIVE")).toBe("Active");
      expect(normalizeProposalStateName("dEfEaTeD")).toBe("Defeated");
      expect(normalizeProposalStateName("  queued  ")).toBe("Queued");
    });

    it("returns Unknown for unrecognized or missing states", () => {
      expect(normalizeProposalStateName("Unknown")).toBe("Unknown");
      expect(normalizeProposalStateName("not-a-state")).toBe("Unknown");
      expect(normalizeProposalStateName("")).toBe("Unknown");
      expect(normalizeProposalStateName(null)).toBe("Unknown");
      expect(normalizeProposalStateName(undefined)).toBe("Unknown");
    });
  });

  describe("IN_FLIGHT_PROPOSAL_STATES", () => {
    it("covers the states that can still change without a new event", () => {
      expect([...IN_FLIGHT_PROPOSAL_STATES].sort()).toEqual([
        "Active",
        "Pending",
        "Unknown",
      ]);
    });

    it("excludes Defeated, which is windowed separately", () => {
      expect(IN_FLIGHT_PROPOSAL_STATES).not.toContain("Defeated");
    });
  });

  describe("ADVANCEABLE_PROPOSAL_STATES", () => {
    it("adds the post-vote states that queue() and execute() move on", () => {
      expect([...ADVANCEABLE_PROPOSAL_STATES].sort()).toEqual([
        "Active",
        "Pending",
        "Queued",
        "Succeeded",
        "Unknown",
      ]);
    });

    it("excludes the states the governor never leaves", () => {
      for (const state of ["Canceled", "Expired", "Executed"] as const) {
        expect(ADVANCEABLE_PROPOSAL_STATES).not.toContain(state);
      }
    });
  });
});
