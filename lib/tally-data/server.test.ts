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
// 0xJiro ran in elections 0 and 2; the export holds the second registration,
// the backfill the first.
const JIRO = "0x093F1f3Af6f573b854144e8842a5b20276b4512B";
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

  it("serves an earlier run's own registration, not the latest", async () => {
    expect((await getCachedElectionCandidate(JIRO, 0))?.title).toBe(
      "Head of Ops & Core Dev @ Sushi"
    );
    expect((await getCachedElectionCandidate(JIRO, 2))?.title).toBe(
      "Sushi - Head of Ops & Core Dev"
    );
    expect(await getCachedElectionCandidate(JIRO, 1)).toBeNull();
  });

  it("prerenders one page per placed registration", async () => {
    const params = await getCachedElectionCandidateStaticParams();
    // 153 exported plus 35 earlier registrations backfilled from Tally.
    expect(params).toHaveLength(188);
    expect(params).toContainEqual({
      electionIndex: "0",
      address: JIRO.toLowerCase(),
    });
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
