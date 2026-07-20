import { afterEach, describe, expect, it, vi } from "vitest";

import { GET } from "./route";

function context(path: string[]) {
  return { params: Promise.resolve({ path }) };
}

describe("governance indexer proxy", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("returns 503 when the indexer URL is not configured", async () => {
    vi.stubEnv("GOVERNANCE_INDEXER_URL", "");

    const response = await GET(
      new Request(
        "https://example.test/api/governance-indexer/api/tally/stats"
      ),
      context(["api", "tally", "stats"])
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "Governance indexer is not configured.",
    });
  });

  it("proxies the encoded path and query string to the configured upstream", async () => {
    vi.stubEnv("GOVERNANCE_INDEXER_URL", "https://indexer.example.test/");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        statusText: "OK",
      })
    );

    const response = await GET(
      new Request(
        "https://example.test/api/governance-indexer/api/tally/delegates?query=dao&limit=10"
      ),
      context(["api", "tally", "delegates"])
    );

    expect(response.status).toBe(200);
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      "https://indexer.example.test/api/tally/delegates?query=dao&limit=10"
    );
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: "GET",
      headers: { accept: "application/json" },
    });
    expect(response.headers.get("content-type")).toBe("application/json");
    expect(response.headers.get("cache-control")).toBe(
      "public, s-maxage=30, stale-while-revalidate=300"
    );
  });

  it("forwards upstream status codes", async () => {
    vi.stubEnv("GOVERNANCE_INDEXER_URL", "https://indexer.example.test");
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "missing" }), {
        status: 404,
        statusText: "Not Found",
      })
    );

    const response = await GET(
      new Request(
        "https://example.test/api/governance-indexer/api/tally/missing"
      ),
      context(["api", "tally", "missing"])
    );

    expect(response.status).toBe(404);
    expect(response.statusText).toBe("Not Found");
  });

  it("returns 502 for upstream failures", async () => {
    vi.stubEnv("GOVERNANCE_INDEXER_URL", "https://indexer.example.test");
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("offline"));

    const response = await GET(
      new Request(
        "https://example.test/api/governance-indexer/api/tally/stats"
      ),
      context(["api", "tally", "stats"])
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: "Indexer upstream error.",
    });
  });
});
