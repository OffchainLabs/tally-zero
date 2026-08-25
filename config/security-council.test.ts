import { describe, expect, it } from "vitest";

import {
  CANDIDATE_ROTATION_CUTOFF_DAYS,
  formatQuorumPercent,
  getPhaseDescription,
  NOMINEE_QUORUM_PERCENT,
  PHASE_METADATA,
} from "./security-council";

describe("formatQuorumPercent", () => {
  it("formats the governor's quorum fraction", () => {
    expect(formatQuorumPercent(10, 10_000)).toBe("0.1%");
    expect(formatQuorumPercent(20, 10_000)).toBe("0.2%");
    expect(formatQuorumPercent(500, 10_000)).toBe("5%");
  });

  it("accepts the bigints the contract reads return", () => {
    expect(formatQuorumPercent(BigInt(10), BigInt(10_000))).toBe("0.1%");
  });

  it("falls back to the configured percentage when a read is missing", () => {
    const fallback = `${NOMINEE_QUORUM_PERCENT}%`;
    expect(formatQuorumPercent(undefined, BigInt(10_000))).toBe(fallback);
    expect(formatQuorumPercent(BigInt(10), undefined)).toBe(fallback);
    expect(formatQuorumPercent()).toBe(fallback);
  });

  it("falls back rather than dividing by a nonsense denominator", () => {
    const fallback = `${NOMINEE_QUORUM_PERCENT}%`;
    expect(formatQuorumPercent(BigInt(10), BigInt(0))).toBe(fallback);
    expect(formatQuorumPercent(BigInt(0), BigInt(10_000))).toBe(fallback);
    expect(formatQuorumPercent(NaN, 10_000)).toBe(fallback);
  });
});

describe("getPhaseDescription", () => {
  it("folds the live threshold into the nominee selection description", () => {
    expect(
      getPhaseDescription("NOMINEE_SELECTION", { quorumPercentLabel: "0.1%" })
    ).toContain("0.1% of votable ARB");
  });

  it("uses the fallback percentage when no label is supplied", () => {
    expect(getPhaseDescription("NOMINEE_SELECTION")).toContain(
      `${NOMINEE_QUORUM_PERCENT}% of votable ARB`
    );
  });

  it("never bakes a threshold into the stored metadata", () => {
    expect(PHASE_METADATA.NOMINEE_SELECTION.description).not.toMatch(/%/);
  });

  it("leaves other phases untouched", () => {
    expect(
      getPhaseDescription("MEMBER_ELECTION", { quorumPercentLabel: "0.1%" })
    ).toBe(PHASE_METADATA.MEMBER_ELECTION.description);
  });
});

describe("compliance phase description", () => {
  it("states the candidate key rotation cutoff", () => {
    expect(PHASE_METADATA.VETTING_PERIOD.description).toContain(
      `rotate their signer key until ${CANDIDATE_ROTATION_CUTOFF_DAYS} days`
    );
  });
});
