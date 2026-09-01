import { describe, expect, it } from "vitest";

import { deriveCadenceMonths, describeElectionCadence } from "./helpers";

const SEPT_15_2026 = Math.floor(Date.UTC(2026, 8, 15, 12) / 1000);
const MARCH_15_2027 = Math.floor(Date.UTC(2027, 2, 15, 12) / 1000);
const MARCH_15_2028 = Math.floor(Date.UTC(2028, 2, 15, 12) / 1000);

describe("deriveCadenceMonths", () => {
  it("reads 6 months off the pre-upgrade half-yearly schedule", () => {
    expect(deriveCadenceMonths(SEPT_15_2026, MARCH_15_2027)).toBe(6);
  });

  it("reads 12 months off the post-upgrade yearly schedule", () => {
    expect(deriveCadenceMonths(MARCH_15_2027, MARCH_15_2028)).toBe(12);
  });

  it("does not care which election comes first", () => {
    expect(deriveCadenceMonths(MARCH_15_2028, MARCH_15_2027)).toBe(12);
  });

  it("returns null when either timestamp is missing or non-positive", () => {
    expect(deriveCadenceMonths(null, MARCH_15_2027)).toBeNull();
    expect(deriveCadenceMonths(MARCH_15_2027, null)).toBeNull();
    expect(deriveCadenceMonths(0, MARCH_15_2027)).toBeNull();
    expect(deriveCadenceMonths(MARCH_15_2027, -1)).toBeNull();
  });

  it("returns null when both elections share a timestamp", () => {
    expect(deriveCadenceMonths(MARCH_15_2027, MARCH_15_2027)).toBeNull();
  });
});

describe("describeElectionCadence", () => {
  it("states the interval and the resulting term length", () => {
    expect(describeElectionCadence(12)).toBe(
      "Elections are now held every 12 months and replace one cohort, so a member serves a 2-year term."
    );
    expect(describeElectionCadence(6)).toBe(
      "Elections are now held every 6 months and replace one cohort, so a member serves a 1-year term."
    );
  });

  it("keeps a term that is not a whole number of years in months", () => {
    expect(describeElectionCadence(9)).toContain("18-month term");
  });

  it("drops the interval when the cadence is unknown", () => {
    const sentence = describeElectionCadence(null);
    expect(sentence).not.toMatch(/months/);
    expect(sentence).toContain("two election cycles");
  });
});
