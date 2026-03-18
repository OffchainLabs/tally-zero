import { describe, expect, it } from "vitest";

import { PROPOSAL_STATE, PROPOSAL_STATE_MAP } from "@gzeoneth/gov-tracker";

import { initialState } from "./initial-state";

describe("initial-state config", () => {
  describe("initialState", () => {
    it("has empty governor state", () => {
      expect(initialState.governor.address).toBeUndefined();
      expect(initialState.governor.contract).toBeNull();
      expect(initialState.governor.name).toBeUndefined();
    });

    it("has empty token state", () => {
      expect(initialState.token.address).toBeUndefined();
      expect(initialState.token.contract).toBeNull();
    });

    it("has empty proposals array", () => {
      expect(initialState.proposals).toEqual([]);
      expect(Array.isArray(initialState.proposals)).toBe(true);
    });
  });

  describe("PROPOSAL_STATE constants (from SDK)", () => {
    it("has Pending as 0", () => {
      expect(PROPOSAL_STATE.PENDING).toBe(0);
    });

    it("has Active as 1", () => {
      expect(PROPOSAL_STATE.ACTIVE).toBe(1);
    });

    it("has Canceled as 2", () => {
      expect(PROPOSAL_STATE.CANCELED).toBe(2);
    });

    it("has Defeated as 3", () => {
      expect(PROPOSAL_STATE.DEFEATED).toBe(3);
    });

    it("has Succeeded as 4", () => {
      expect(PROPOSAL_STATE.SUCCEEDED).toBe(4);
    });

    it("has Queued as 5", () => {
      expect(PROPOSAL_STATE.QUEUED).toBe(5);
    });

    it("has Expired as 6", () => {
      expect(PROPOSAL_STATE.EXPIRED).toBe(6);
    });

    it("has Executed as 7", () => {
      expect(PROPOSAL_STATE.EXECUTED).toBe(7);
    });

    it("maps numeric states to strings", () => {
      expect(PROPOSAL_STATE_MAP[PROPOSAL_STATE.PENDING]).toBe("Pending");
      expect(PROPOSAL_STATE_MAP[PROPOSAL_STATE.EXECUTED]).toBe("Executed");
    });

    it("has 8 states total", () => {
      expect(Object.keys(PROPOSAL_STATE).length).toBe(8);
    });
  });
});
