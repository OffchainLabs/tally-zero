import { describe, expect, it } from "vitest";

import {
  countQualifiedNominees,
  getContenderDescription,
  hasExhaustedVotes,
  hasNoVotingPower,
  hasReachedQuorum,
  shouldShowNomineeShortfall,
} from "./election-utils";

describe("hasNoVotingPower", () => {
  it("returns true when 0n", () => {
    expect(hasNoVotingPower(BigInt(0))).toBe(true);
  });
  it("returns false when positive", () => {
    expect(hasNoVotingPower(BigInt(1000))).toBe(false);
  });
  it("returns false when undefined", () => {
    expect(hasNoVotingPower(undefined)).toBe(false);
  });
});

describe("hasExhaustedVotes", () => {
  it("true when available=0 and used>0", () => {
    expect(hasExhaustedVotes(BigInt(0), BigInt(500))).toBe(true);
  });
  it("false when available>0", () => {
    expect(hasExhaustedVotes(BigInt(100), BigInt(400))).toBe(false);
  });
  it("false when both are 0", () => {
    expect(hasExhaustedVotes(BigInt(0), BigInt(0))).toBe(false);
  });
  it("false when available undefined", () => {
    expect(hasExhaustedVotes(undefined, BigInt(0))).toBe(false);
  });
  it("false when used undefined", () => {
    expect(hasExhaustedVotes(BigInt(0), undefined)).toBe(false);
  });
});

describe("hasReachedQuorum", () => {
  it("true when votes >= threshold", () => {
    expect(hasReachedQuorum("1000", "500")).toBe(true);
  });
  it("true when votes == threshold", () => {
    expect(hasReachedQuorum("500", "500")).toBe(true);
  });
  it("false when votes < threshold", () => {
    expect(hasReachedQuorum("499", "500")).toBe(false);
  });
  it("false when threshold is 0", () => {
    expect(hasReachedQuorum("1000", "0")).toBe(false);
  });
  it("handles large wei values", () => {
    expect(
      hasReachedQuorum("250000000000000000000000", "200000000000000000000000")
    ).toBe(true);
  });
});

describe("countQualifiedNominees", () => {
  it("counts non-excluded nominees above threshold", () => {
    const nominees = [
      { votesReceived: "600", isExcluded: false },
      { votesReceived: "700", isExcluded: false },
      { votesReceived: "300", isExcluded: false },
    ];
    expect(countQualifiedNominees(nominees, "500")).toBe(2);
  });
  it("excludes flagged nominees", () => {
    const nominees = [
      { votesReceived: "600", isExcluded: true },
      { votesReceived: "700", isExcluded: false },
    ];
    expect(countQualifiedNominees(nominees, "500")).toBe(1);
  });
  it("returns 0 for empty array", () => {
    expect(countQualifiedNominees([], "500")).toBe(0);
  });
  it("returns 0 when none reach threshold", () => {
    const nominees = [
      { votesReceived: "100", isExcluded: false },
      { votesReceived: "200", isExcluded: false },
    ];
    expect(countQualifiedNominees(nominees, "500")).toBe(0);
  });
});

describe("shouldShowNomineeShortfall", () => {
  it("true when below target", () => {
    expect(shouldShowNomineeShortfall(3, 6)).toBe(true);
  });
  it("true when 0", () => {
    expect(shouldShowNomineeShortfall(0, 6)).toBe(true);
  });
  it("false when equals target", () => {
    expect(shouldShowNomineeShortfall(6, 6)).toBe(false);
  });
  it("false when exceeds target", () => {
    expect(shouldShowNomineeShortfall(8, 6)).toBe(false);
  });
});

describe("getContenderDescription", () => {
  it("basic count during CONTENDER_SUBMISSION", () => {
    expect(getContenderDescription(5, 0, "CONTENDER_SUBMISSION")).toBe(
      "5 contenders registered"
    );
  });
  it("basic count during NOMINEE_SELECTION with none qualified", () => {
    expect(getContenderDescription(5, 0, "NOMINEE_SELECTION")).toBe(
      "5 contenders registered"
    );
  });
  it("includes qualified count during NOMINEE_SELECTION", () => {
    expect(getContenderDescription(8, 3, "NOMINEE_SELECTION")).toBe(
      "8 contenders registered, 3 qualified as nominees"
    );
  });
  it("singular contender", () => {
    expect(getContenderDescription(1, 0, "CONTENDER_SUBMISSION")).toBe(
      "1 contender registered"
    );
  });
});
