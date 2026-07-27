import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DELEGATE_LIST_MAX_ROWS,
  DELEGATE_MIN_VOTING_POWER_WEI,
} from "@/config/delegates";
import { IndexerTallyDataClient } from "@/lib/tally-data/indexer";

function mockJsonFetch(body: unknown, status = 200) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    })
  );
}

describe("IndexerTallyDataClient", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("routes delegate list requests through the governance indexer proxy", async () => {
    const fetchMock = mockJsonFetch({
      delegates: [],
      totalVotingPower: "0",
      totalSupply: "0",
    });

    await new IndexerTallyDataClient().getDelegateList("42", 7);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/governance-indexer/api/tally/delegates?minVotingPower=42&limit=7",
      { headers: { accept: "application/json" } }
    );
  });

  it("defaults delegate list requests to the eligibility threshold and an explicit row cap", async () => {
    const fetchMock = mockJsonFetch({
      delegates: [],
      totalVotingPower: "0",
      totalSupply: "0",
    });

    await new IndexerTallyDataClient().getDelegateList();

    const url = new URL(String(fetchMock.mock.calls[0][0]), "https://app.test");
    expect(url.searchParams.get("minVotingPower")).toBe(
      DELEGATE_MIN_VOTING_POWER_WEI
    );
    // The indexer silently truncates at 1,000 rows without an explicit limit.
    expect(Number(url.searchParams.get("limit"))).toBe(DELEGATE_LIST_MAX_ROWS);
  });

  it("fetches aggregated vote summaries from the app route, not the proxy", async () => {
    const entries = [
      {
        proposalId: "1",
        governorAddress: "0xaaa",
        voteSummary: {
          for: { weight: "10", count: 2 },
          against: { weight: "5", count: 1 },
          abstain: { weight: "0", count: 0 },
          totalCount: 3,
        },
      },
    ];
    const fetchMock = mockJsonFetch(entries);

    await expect(
      new IndexerTallyDataClient().getAllProposalVoteSummaries()
    ).resolves.toEqual(entries);

    expect(fetchMock).toHaveBeenCalledWith("/api/proposal-vote-summaries", {
      headers: { accept: "application/json" },
    });
  });

  it("normalizes, dedupes, and batches address map requests", async () => {
    const addresses = Array.from(
      { length: 201 },
      (_, index) => `0x${index.toString(16).padStart(40, "0")}`
    );
    const requestedBatches: string[][] = [];
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input) => {
        const url = new URL(String(input), "https://example.test");
        const batch = (url.searchParams.get("addresses") ?? "").split(",");
        requestedBatches.push(batch);
        return new Response(
          JSON.stringify(
            batch.map((address) => ({
              address,
              ens: null,
              name: null,
              picture: null,
              knownLabel: null,
              displayName: null,
            }))
          ),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      });

    const summaries = await new IndexerTallyDataClient().getDelegateSummaries([
      addresses[0].toUpperCase(),
      ...addresses,
      "",
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(requestedBatches.map((batch) => batch.length)).toEqual([200, 1]);
    expect(summaries.size).toBe(201);
    expect(summaries.has(addresses[0])).toBe(true);
  });

  it("fetches the delegate votes watermark from the dedicated endpoint", async () => {
    const fetchMock = mockJsonFetch({ blockNumber: 123 });

    await expect(
      new IndexerTallyDataClient().getDelegateVotesWatermarkBlock()
    ).resolves.toBe(123);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/governance-indexer/api/tally/delegate-votes-watermark",
      { headers: { accept: "application/json" } }
    );
  });

  it("throws when the indexer returns a non-2xx response", async () => {
    mockJsonFetch({ error: "bad" }, 500);

    await expect(new IndexerTallyDataClient().getStats()).rejects.toThrow(
      "Governance indexer request failed: 500"
    );
  });
});
