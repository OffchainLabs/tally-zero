import { describe, expect, it } from "vitest";

import { subtractExcludedVotingPower } from "@/lib/total-voting-power";

describe("subtractExcludedVotingPower", () => {
  it("subtracts the exclude address's votes from total delegation", () => {
    // Real magnitudes read on-chain 2026-08-11: ~5.34B ARB delegated in total,
    // ~5.01B of it parked at the exclude address, leaving ~325M ARB.
    const result = subtractExcludedVotingPower("5337564619000000000000000000", [
      "5012517049000000000000000000",
    ]);
    expect(result).toBe("325047570000000000000000000");
  });

  it("subtracts every excluded address", () => {
    const result = subtractExcludedVotingPower("1000", ["100", "250"]);
    expect(result).toBe("650");
  });

  it("returns the total unchanged when nothing is excluded", () => {
    expect(subtractExcludedVotingPower("1000", [])).toBe("1000");
  });

  it("clamps at zero rather than returning a negative total", () => {
    // A read that saw the exclude balance and the total at different moments
    // could report an exclude balance larger than the total.
    expect(subtractExcludedVotingPower("100", ["250"])).toBe("0");
  });

  it("handles values beyond Number.MAX_SAFE_INTEGER without precision loss", () => {
    expect(subtractExcludedVotingPower("9007199254740993", ["1"])).toBe(
      "9007199254740992"
    );
  });
});
