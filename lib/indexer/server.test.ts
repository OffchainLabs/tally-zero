import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getIndexerUrl,
  indexerErrorResponse,
  indexerFetch,
  IndexerUnconfiguredError,
} from "./server";

describe("getIndexerUrl", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("trims and strips trailing slashes; null when unset", () => {
    vi.stubEnv("GOVERNANCE_INDEXER_URL", "  https://idx.example/// ");
    expect(getIndexerUrl()).toBe("https://idx.example");
    vi.stubEnv("GOVERNANCE_INDEXER_URL", "");
    expect(getIndexerUrl()).toBeNull();
  });
});

describe("indexerFetch", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("resolves the base, forwards cookie + accept, joins base/path", async () => {
    vi.stubEnv("GOVERNANCE_INDEXER_URL", "https://idx.example");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));

    await indexerFetch("/api/me/avatar-intent", {
      method: "POST",
      cookie: "siwe_session=tok",
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://idx.example/api/me/avatar-intent");
    expect(init).toMatchObject({
      method: "POST",
      headers: { accept: "application/json", cookie: "siwe_session=tok" },
    });
  });

  it("omits the cookie header when none is provided", async () => {
    vi.stubEnv("GOVERNANCE_INDEXER_URL", "https://idx.example");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));

    await indexerFetch("/api/tally/stats");

    expect(fetchMock.mock.calls[0][1]!.headers).not.toHaveProperty("cookie");
  });

  it("throws IndexerUnconfiguredError when the base URL is unset", async () => {
    vi.stubEnv("GOVERNANCE_INDEXER_URL", "");
    const fetchMock = vi.spyOn(globalThis, "fetch");
    await expect(indexerFetch("/api/tally/stats")).rejects.toBeInstanceOf(
      IndexerUnconfiguredError
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("indexerErrorResponse", () => {
  it("maps IndexerUnconfiguredError → 503", async () => {
    const res = indexerErrorResponse(new IndexerUnconfiguredError());
    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({
      error: "Governance indexer is not configured.",
    });
  });

  it("maps any other error → 502", async () => {
    const res = indexerErrorResponse(new Error("socket hang up"));
    expect(res.status).toBe(502);
    await expect(res.json()).resolves.toEqual({
      error: "Indexer upstream error.",
    });
  });
});
