import { describe, expect, it } from "vitest";

import {
  CANDIDATE_ROTATION_CUTOFF_DAYS,
  FIRST_ELECTION_UNDER_CURRENT_RULES,
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
    expect(getPhaseDescription("VETTING_PERIOD")).toContain(
      `rotate their signer key until ${CANDIDATE_ROTATION_CUTOFF_DAYS} days`
    );
  });

  it("never bakes key rotation into the stored metadata", () => {
    expect(PHASE_METADATA.VETTING_PERIOD.description).not.toMatch(/rotate/);
  });
});

// Elections 0 through 5 ran before the "Security Council Election Process
// Improvements" AIP executed, so neither the 0.1% threshold nor candidate key
// rotation applied to them.
describe("getPhaseDescription for an election that predates the AIP", () => {
  it("states no qualification threshold", () => {
    const description = getPhaseDescription("NOMINEE_SELECTION", {
      quorumPercentLabel: "0.1%",
      underCurrentRules: false,
    });

    expect(description).toBe(PHASE_METADATA.NOMINEE_SELECTION.description);
    expect(description).not.toMatch(/%/);
  });

  it("does not offer candidates a key rotation they never had", () => {
    const description = getPhaseDescription("VETTING_PERIOD", {
      underCurrentRules: false,
    });

    expect(description).toBe(PHASE_METADATA.VETTING_PERIOD.description);
    expect(description).not.toMatch(/rotate/);
  });

  it("describes the current rules when told nothing about the election", () => {
    expect(getPhaseDescription("NOMINEE_SELECTION")).toMatch(/%/);
    expect(getPhaseDescription("VETTING_PERIOD")).toMatch(/rotate/);
  });

  it("puts the boundary in the gap after the last pre-AIP election", () => {
    // Index 5 ran in March 2026, index 6 is scheduled for March 2027, and the
    // AIP executed between them.
    expect(FIRST_ELECTION_UNDER_CURRENT_RULES).toBe(6);
  });
});
