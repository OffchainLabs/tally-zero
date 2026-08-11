import { afterEach, describe, expect, it, vi } from "vitest";

import { TOTAL_VOTING_POWER_REVALIDATE_SECONDS } from "@/lib/total-voting-power";

const getCachedTotalVotingPower = vi.hoisted(() => vi.fn());

// Factory mock, so the real module (and its `server-only` import) never loads.
vi.mock("@/lib/total-voting-power/server", () => ({
  getCachedTotalVotingPower,
}));

const { GET } = await import("./route");

const snapshot = {
  totalVotingPower: "325047569000000000000000000",
  totalDelegation: "5337564619000000000000000000",
  excludedVotingPower: "5012517050000000000000000000",
  blockNumber: 400_000_000,
};

describe("total voting power route", () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it("returns the cached snapshot", async () => {
    getCachedTotalVotingPower.mockResolvedValueOnce(snapshot);

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(snapshot);
  });

  it("lets the CDN hold the figure for the full revalidate window", async () => {
    getCachedTotalVotingPower.mockResolvedValueOnce(snapshot);

    const response = await GET();

    // Every user gets the same number, so it is shared cache (s-maxage), not
    // per-browser cache.
    expect(response.headers.get("cache-control")).toBe(
      `public, s-maxage=${TOTAL_VOTING_POWER_REVALIDATE_SECONDS}, ` +
        `stale-while-revalidate=${TOTAL_VOTING_POWER_REVALIDATE_SECONDS}`
    );
    expect(TOTAL_VOTING_POWER_REVALIDATE_SECONDS).toBe(3600);
  });

  it("returns 502 when both RPCs fail", async () => {
    getCachedTotalVotingPower.mockRejectedValueOnce(
      new Error("Both RPCs failed.")
    );

    const response = await GET();

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: "Failed to read total voting power on-chain.",
    });
  });
});
