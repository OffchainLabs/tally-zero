import { afterEach, describe, expect, it, vi } from "vitest";

import { siweApi, SiweApiError } from "./client";

function mockFetchOnce(
  body: unknown,
  init: { status: number; statusText?: string }
) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
    new Response(body === undefined ? "" : JSON.stringify(body), {
      status: init.status,
      statusText: init.statusText ?? "",
      headers: { "content-type": "application/json" },
    })
  );
}

describe("siweApi error parsing", () => {
  afterEach(() => vi.restoreAllMocks());

  it("surfaces the indexer's nested { error: { code, message } }", async () => {
    mockFetchOnce(
      {
        error: {
          code: "not_delegate",
          message:
            "Only delegates above the voting-power threshold can upload an avatar.",
        },
      },
      { status: 403, statusText: "Forbidden" }
    );

    const err = await siweApi
      .patchProfile({ name: "x" })
      .then(() => null)
      .catch((e) => e);

    expect(err).toBeInstanceOf(SiweApiError);
    expect(err.status).toBe(403);
    expect(err.code).toBe("not_delegate");
    // The precise indexer message, NOT the HTTP status text.
    expect(err.message).toContain("voting-power threshold");
  });

  it("surfaces the proxy's flat { error: string } (e.g. 503 unconfigured)", async () => {
    mockFetchOnce(
      { error: "Governance indexer is not configured." },
      { status: 503, statusText: "Service Unavailable" }
    );

    const err = await siweApi
      .verify("m", "0x1")
      .then(() => null)
      .catch((e) => e);

    expect(err).toBeInstanceOf(SiweApiError);
    expect(err.status).toBe(503);
    expect(err.message).toBe("Governance indexer is not configured.");
  });

  it("falls back to status text when there is no body", async () => {
    mockFetchOnce(undefined, {
      status: 500,
      statusText: "Internal Server Error",
    });

    const err = await siweApi
      .nonce()
      .then(() => null)
      .catch((e) => e);

    expect(err).toBeInstanceOf(SiweApiError);
    expect(err.message).toBe("Internal Server Error");
  });

  it("me() maps 401 to null rather than throwing", async () => {
    mockFetchOnce(
      { error: { code: "no_session", message: "no" } },
      { status: 401 }
    );
    await expect(siweApi.me()).resolves.toBeNull();
  });
});
