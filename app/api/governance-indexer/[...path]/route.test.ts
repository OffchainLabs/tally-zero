import { afterEach, describe, expect, it, vi } from "vitest";

import { GET, POST } from "./route";

function context(path: string[]) {
  return { params: Promise.resolve({ path }) };
}

function jsonResponse(
  body: unknown,
  init: ResponseInit & { setCookie?: string } = {}
) {
  const { setCookie, ...rest } = init;
  const headers = new Headers({ "content-type": "application/json" });
  if (setCookie) headers.append("set-cookie", setCookie);
  return new Response(JSON.stringify(body), { ...rest, headers });
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
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        jsonResponse({ ok: true }, { status: 200, statusText: "OK" })
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
    // Anonymous GETs relay the upstream content-type and stay CDN-cacheable.
    expect(response.headers.get("content-type")).toBe("application/json");
    expect(response.headers.get("cache-control")).toBe(
      "public, s-maxage=30, stale-while-revalidate=300"
    );
  });

  it("forwards a POST body + cookie and relays the session set-cookie (no-store)", async () => {
    vi.stubEnv("GOVERNANCE_INDEXER_URL", "https://indexer.example.test");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        jsonResponse(
          { address: "0xabc" },
          {
            status: 200,
            setCookie: "siwe_session=tok; Path=/; HttpOnly; SameSite=Lax",
          }
        )
      );

    const response = await POST(
      new Request(
        "https://example.test/api/governance-indexer/api/auth/verify",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie: "siwe_session=prev",
          },
          body: JSON.stringify({ message: "m", signature: "0x1" }),
        }
      ),
      context(["api", "auth", "verify"])
    );

    expect(response.status).toBe(200);
    const init = fetchMock.mock.calls[0][1]!;
    expect(init.method).toBe("POST");
    expect(init.body).toBeDefined();
    expect(init.headers).toMatchObject({
      "content-type": "application/json",
      cookie: "siwe_session=prev",
    });
    // Credentialed responses are never shared-cached, and the session cookie
    // is relayed back to the browser.
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.getSetCookie()).toContain(
      "siwe_session=tok; Path=/; HttpOnly; SameSite=Lax"
    );
  });

  it("does not shared-cache a GET that carries a cookie", async () => {
    vi.stubEnv("GOVERNANCE_INDEXER_URL", "https://indexer.example.test");
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      jsonResponse({ ok: true }, { status: 200 })
    );

    const response = await GET(
      new Request("https://example.test/api/governance-indexer/api/me", {
        headers: { cookie: "siwe_session=tok" },
      }),
      context(["api", "me"])
    );

    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("forwards upstream status codes", async () => {
    vi.stubEnv("GOVERNANCE_INDEXER_URL", "https://indexer.example.test");
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      jsonResponse(
        { error: "missing" },
        { status: 404, statusText: "Not Found" }
      )
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
