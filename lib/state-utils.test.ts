import { describe, expect, it } from "vitest";

import { findStateByValue, getStateName } from "./state-utils";

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
});
