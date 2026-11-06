import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  unstable_cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}));

const {
  getCachedElectionAddressDisplayRecords,
  getCachedElectionCandidate,
  getCachedElectionCandidateStaticParams,
} = await import("./server");

// netto.eth's export record is their March 2026 registration (election 5).
const NETTO = "0x358E76A0C6224dCABCe39ff395b284e7da9bf413";
// A record with no registration date, so no election to place it in.
const UNPLACED = "0x78bB97d2F3811256D7F0041E81Aaf4B426eF3b67";

describe("per-election candidate lookups", () => {
  it("returns a registration only for the election it was made for", async () => {
    expect((await getCachedElectionCandidate(NETTO, 5))?.name).toBe(
      "netto.eth | blockful"
    );
    expect(await getCachedElectionCandidate(NETTO, 4)).toBeNull();
    // Without an election, the latest registration as before.
    expect((await getCachedElectionCandidate(NETTO))?.electionIndex).toBe(5);
  });

  it("prerenders one page per placed registration", async () => {
    const params = await getCachedElectionCandidateStaticParams();
    expect(params).toHaveLength(153);
    expect(params).toContainEqual({
      electionIndex: "5",
      address: NETTO.toLowerCase(),
    });
    expect(params.some((p) => p.address === UNPLACED.toLowerCase())).toBe(
      false
    );
  });

  it("links each candidate to the election of their registration", async () => {
    const records = await getCachedElectionAddressDisplayRecords();
    const byAddress = new Map(records.map((r) => [r.address, r.profileUrl]));
    expect(byAddress.get(NETTO)).toBe(
      `/security-council/elections/5/contender/${NETTO.toLowerCase()}`
    );
    expect(byAddress.get(UNPLACED)).toBe(
      `/security-council/contender/${UNPLACED.toLowerCase()}`
    );
  });
});
