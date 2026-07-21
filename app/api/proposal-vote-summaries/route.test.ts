import { afterEach, describe, expect, it, vi } from "vitest";

import { GET } from "./route";

const SUMMARY = {
  for: { weight: "10", count: 2 },
  against: { weight: "5", count: 1 },
  abstain: { weight: "0", count: 0 },
  totalCount: 3,
};

function indexEntry(proposalId: string, governorAddress: string) {
  return {
    proposalId,
    governorAddress,
    snapshotBlock: 1,
    state: "EXECUTED",
    proposer: null,
    description: null,
  };
}

describe("proposal vote summaries aggregation", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("returns 503 when the indexer URL is not configured", async () => {
    vi.stubEnv("GOVERNANCE_INDEXER_URL", "");

    const response = await GET();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "Governance indexer is not configured.",
    });
  });

  it("fans out one summary request per indexed proposal", async () => {
    vi.stubEnv("GOVERNANCE_INDEXER_URL", "https://indexer.example.test/");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input) => {
        const url = String(input);
        if (url.endsWith("/api/tally/proposals")) {
          return new Response(
            JSON.stringify([
              indexEntry("1", "0xF07DED9dC292157749B6Fd268E37DF6EA38395B9"),
              indexEntry("2", "0x789fc99093b09ad01c34dc7251d0c89ce743e5b4"),
            ]),
            { status: 200 }
          );
        }
        return new Response(JSON.stringify(SUMMARY), { status: 200 });
      });

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([
      {
        proposalId: "1",
        governorAddress: "0xf07ded9dc292157749b6fd268e37df6ea38395b9",
        voteSummary: SUMMARY,
      },
      {
        proposalId: "2",
        governorAddress: "0x789fc99093b09ad01c34dc7251d0c89ce743e5b4",
        voteSummary: SUMMARY,
      },
    ]);
    expect(response.headers.get("cache-control")).toBe(
      "public, s-maxage=30, stale-while-revalidate=300"
    );
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      "https://indexer.example.test/api/tally/proposals"
    );
    expect(String(fetchMock.mock.calls[1][0])).toBe(
      "https://indexer.example.test/api/tally/proposals/0xf07ded9dc292157749b6fd268e37df6ea38395b9/1/vote-summary"
    );
  });

  it("omits proposals whose summary fetch fails", async () => {
    vi.stubEnv("GOVERNANCE_INDEXER_URL", "https://indexer.example.test");
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/api/tally/proposals")) {
        return new Response(
          JSON.stringify([indexEntry("1", "0xaaa"), indexEntry("2", "0xbbb")]),
          { status: 200 }
        );
      }
      if (url.includes("/0xaaa/1/")) {
        return new Response("{}", { status: 500 });
      }
      return new Response(JSON.stringify(SUMMARY), { status: 200 });
    });

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([
      { proposalId: "2", governorAddress: "0xbbb", voteSummary: SUMMARY },
    ]);
  });

  it("returns 502 when the index fetch fails", async () => {
    vi.stubEnv("GOVERNANCE_INDEXER_URL", "https://indexer.example.test");
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("offline"));

    const response = await GET();

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: "Indexer upstream error.",
    });
  });
});
