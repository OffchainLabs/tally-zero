import { afterEach, describe, expect, it, vi } from "vitest";

import { IndexerUnconfiguredError } from "@/lib/indexer/server";
import {
  TOP_DELEGATES_REVALIDATE_SECONDS,
  TOP_DELEGATES_STALE_SECONDS,
} from "@/lib/top-delegates";

const getCachedTopDelegates = vi.hoisted(() => vi.fn());

// Factory mock, so the real module (and its `server-only` import) never loads.
vi.mock("@/lib/top-delegates/server", () => ({
  getCachedTopDelegates,
}));

const { GET } = await import("./route");

const snapshot = {
  delegates: [
    {
      address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      votingPower: "1000",
      lastChangeBlock: 10,
    },
  ],
  fetchedAt: "2026-10-30T12:00:00.000Z",
};

describe("top delegates route", () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it("returns the cached snapshot", async () => {
    getCachedTopDelegates.mockResolvedValueOnce(snapshot);

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(snapshot);
  });

  it("lets the CDN serve a stale list for a day while revalidating hourly", async () => {
    getCachedTopDelegates.mockResolvedValueOnce(snapshot);

    const response = await GET();

    expect(response.headers.get("cache-control")).toBe(
      `public, s-maxage=${TOP_DELEGATES_REVALIDATE_SECONDS}, ` +
        `stale-while-revalidate=${TOP_DELEGATES_STALE_SECONDS}`
    );
    expect(TOP_DELEGATES_REVALIDATE_SECONDS).toBe(3600);
    expect(TOP_DELEGATES_STALE_SECONDS).toBe(86_400);
  });

  it("returns 502 when the indexer has never answered", async () => {
    getCachedTopDelegates.mockRejectedValueOnce(
      new Error("Indexer request failed: 500")
    );

    const response = await GET();

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: "Indexer upstream error.",
    });
  });

  it("returns 503 when the indexer is not configured", async () => {
    getCachedTopDelegates.mockRejectedValueOnce(new IndexerUnconfiguredError());

    const response = await GET();

    expect(response.status).toBe(503);
  });
});
