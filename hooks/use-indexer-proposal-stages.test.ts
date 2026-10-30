import { describe, expect, it } from "vitest";

import { stagesPollInterval } from "./use-indexer-proposal-stages";

describe("stagesPollInterval", () => {
  it("stops once nothing is pending", () => {
    expect(stagesPollInterval(false, Date.now() + 60_000)).toBe(false);
  });
  it("follows quickly for a while after the user acted, then slows down", () => {
    const now = 1_000_000;
    expect(stagesPollInterval(true, now + 10_000, now)).toBe(5_000);
    expect(stagesPollInterval(true, now - 1, now)).toBe(60_000);
  });
});
