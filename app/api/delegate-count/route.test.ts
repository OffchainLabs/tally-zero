import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DELEGATE_MIN_VOTING_POWER_ARB,
  DELEGATE_MIN_VOTING_POWER_WEI,
  EXCLUDED_DELEGATE_ADDRESSES,
} from "@/config/delegates";

import { GET } from "./route";

function listItem(address: string, votingPower: string) {
  return {
    address,
    votingPower,
    lastChangeBlock: 100,
    votesCount: votingPower,
    delegatorsCount: 1,
    isPrioritized: false,
    ens: null,
    name: null,
    picture: null,
    knownLabel: null,
    displayName: null,
  };
}

function mockIndexerList(delegates: ReturnType<typeof listItem>[]) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
    new Response(
      JSON.stringify({
        delegates,
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

  it("asks the indexer for the eligible population with an explicit row cap", async () => {
    vi.stubEnv("GOVERNANCE_INDEXER_URL", "https://indexer.example.test/");
    const fetchMock = mockIndexerList([]);

    await GET();

    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.origin + url.pathname).toBe(
      "https://indexer.example.test/api/tally/delegates"
    );
    expect(url.searchParams.get("minVotingPower")).toBe(
      DELEGATE_MIN_VOTING_POWER_WEI
    );
    // Without this the indexer silently truncates at 1,000 rows.
    expect(Number(url.searchParams.get("limit"))).toBeGreaterThan(1000);
  });

  it("counts only delegates above the threshold, excluding the governance address", async () => {
    vi.stubEnv("GOVERNANCE_INDEXER_URL", "https://indexer.example.test");
    const above = DELEGATE_MIN_VOTING_POWER_WEI;
    const below = (
      BigInt(DELEGATE_MIN_VOTING_POWER_WEI) - BigInt(1)
    ).toString();
    mockIndexerList([
      listItem("0x1111111111111111111111111111111111111111", above),
      listItem("0x2222222222222222222222222222222222222222", above),
      listItem("0x3333333333333333333333333333333333333333", below),
      // The indexer includes the exclude address, and it always clears the bar.
      listItem(EXCLUDED_DELEGATE_ADDRESSES[0], "5000000000000000000000000000"),
    ]);

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
