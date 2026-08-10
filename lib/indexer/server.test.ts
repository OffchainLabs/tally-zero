import { afterEach, describe, expect, it, vi } from "vitest";

import { getIndexerUrl, indexerFetch } from "./server";

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
  afterEach(() => vi.restoreAllMocks());

  it("forwards the cookie + accept header and joins base/path", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));

    await indexerFetch("https://idx.example", "/api/me/avatar-intent", {
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
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));

    await indexerFetch("https://idx.example", "/api/tally/stats");

    const init = fetchMock.mock.calls[0][1]!;
    expect(init.headers).not.toHaveProperty("cookie");
  });
});
