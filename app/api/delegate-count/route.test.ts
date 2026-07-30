import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DELEGATE_MIN_VOTING_POWER_ARB,
  DELEGATE_MIN_VOTING_POWER_WEI,
  EXCLUDED_DELEGATE_ADDRESSES,
} from "@/config/delegates";

import { GET } from "./route";

function mockIndexerCount(totalCount: number) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
    new Response(
      JSON.stringify({
        totalCount,
        totalVotingPower: "0",
        totalSupply: "0",
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    )
  );
}

describe("delegate count route", () => {
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

  it("asks the count endpoint with the threshold and exclude list, no row cap", async () => {
    vi.stubEnv("GOVERNANCE_INDEXER_URL", "https://indexer.example.test/");
    const fetchMock = mockIndexerCount(0);

    await GET();

    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.origin + url.pathname).toBe(
      "https://indexer.example.test/api/tally/delegate-count"
    );
    expect(url.searchParams.get("minVotingPower")).toBe(
      DELEGATE_MIN_VOTING_POWER_WEI
    );
    // Exclusion is applied server-side now; the route forwards the exclude list.
    expect(url.searchParams.get("exclude")).toBe(
      EXCLUDED_DELEGATE_ADDRESSES.join(",")
    );
    // No whole-list read — the count endpoint takes no limit.
    expect(url.searchParams.has("limit")).toBe(false);
  });

  it("relays the server-computed count", async () => {
    vi.stubEnv("GOVERNANCE_INDEXER_URL", "https://indexer.example.test");
    mockIndexerCount(2);

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      count: 2,
      minVotingPowerArb: DELEGATE_MIN_VOTING_POWER_ARB,
      minVotingPower: DELEGATE_MIN_VOTING_POWER_WEI,
    });
    expect(response.headers.get("cache-control")).toBe(
      "public, s-maxage=300, stale-while-revalidate=3600"
    );
  });

  it("returns 502 when the indexer answers with an error status", async () => {
    vi.stubEnv("GOVERNANCE_INDEXER_URL", "https://indexer.example.test");
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("nope", { status: 500 })
    );

    const response = await GET();

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: "Indexer upstream error.",
    });
  });

  it("returns 502 when the indexer is unreachable", async () => {
    vi.stubEnv("GOVERNANCE_INDEXER_URL", "https://indexer.example.test");
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("offline"));

    const response = await GET();

    expect(response.status).toBe(502);
  });
});
