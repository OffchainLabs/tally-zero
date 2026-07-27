import { EXCLUDED_DELEGATE_ADDRESSES as SDK_EXCLUDED_DELEGATE_ADDRESSES } from "@gzeoneth/gov-tracker";
import { describe, expect, it } from "vitest";

import {
  DELEGATE_LIST_MAX_ROWS,
  DELEGATE_MIN_VOTING_POWER_ARB,
  DELEGATE_MIN_VOTING_POWER_WEI,
  EXCLUDED_DELEGATE_ADDRESSES,
  countEligibleDelegates,
  isExcludedDelegateAddress,
} from "./delegates";

const EXCLUDED_ADDRESS = EXCLUDED_DELEGATE_ADDRESSES[0];

function delegate(votingPowerArb: number, address = "0x1111") {
  return {
    address,
    votingPower: (
      BigInt(Math.round(votingPowerArb * 1000)) * BigInt("1000000000000000")
    ).toString(),
  };
}

describe("delegates config", () => {
  describe("threshold", () => {
    it("keeps the wei string in step with the ARB figure", () => {
      expect(DELEGATE_MIN_VOTING_POWER_WEI).toBe(
        (
          BigInt(DELEGATE_MIN_VOTING_POWER_ARB) * BigInt("1000000000000000000")
        ).toString()
      );
    });

    it("asks the indexer for more rows than its silent 1,000-row default", () => {
      expect(DELEGATE_LIST_MAX_ROWS).toBeGreaterThan(1000);
    });
  });

  describe("isExcludedDelegateAddress", () => {
    it("matches the SDK's exclude list", () => {
      expect([...EXCLUDED_DELEGATE_ADDRESSES]).toEqual([
        ...SDK_EXCLUDED_DELEGATE_ADDRESSES,
      ]);
    });

    it("ignores address casing", () => {
      expect(isExcludedDelegateAddress(EXCLUDED_ADDRESS.toLowerCase())).toBe(
        true
      );
      expect(isExcludedDelegateAddress(EXCLUDED_ADDRESS.toUpperCase())).toBe(
        true
      );
    });

    it("does not match ordinary delegates", () => {
      expect(isExcludedDelegateAddress("0xabc")).toBe(false);
    });
  });

  describe("countEligibleDelegates", () => {
    it("counts delegates at or above the threshold", () => {
      const count = countEligibleDelegates([
        delegate(DELEGATE_MIN_VOTING_POWER_ARB, "0xaaa"),
        delegate(DELEGATE_MIN_VOTING_POWER_ARB + 1, "0xbbb"),
      ]);

      expect(count).toBe(2);
    });

    it("drops delegates below the threshold", () => {
      const count = countEligibleDelegates([
        delegate(DELEGATE_MIN_VOTING_POWER_ARB - 0.001, "0xaaa"),
        delegate(0, "0xbbb"),
        delegate(DELEGATE_MIN_VOTING_POWER_ARB, "0xccc"),
      ]);

      expect(count).toBe(1);
    });

    it("drops the governance exclude address however much it holds", () => {
      const count = countEligibleDelegates([
        delegate(5_000_000_000, EXCLUDED_ADDRESS),
        delegate(DELEGATE_MIN_VOTING_POWER_ARB, "0xaaa"),
      ]);

      expect(count).toBe(1);
    });

    it("returns zero for an empty list", () => {
      expect(countEligibleDelegates([])).toBe(0);
    });
  });
});
