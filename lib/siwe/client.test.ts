import { afterEach, describe, expect, it, vi } from "vitest";

import { siweApi, SiweApiError } from "./client";

function mockFetchOnce(
  body: unknown,
  init: { status: number; statusText?: string }
) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
    // null, not "" — the Response constructor rejects a body on 204/304.
    new Response(body === undefined ? null : JSON.stringify(body), {
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

function lastCall(spy: ReturnType<typeof mockFetchOnce>) {
  const [url, init] = spy.mock.calls[0] as [string, RequestInit | undefined];
  return { url, init };
}

describe("siweApi request shaping", () => {
  afterEach(() => vi.restoreAllMocks());

  it("unwraps the collection envelopes", async () => {
    mockFetchOnce({ safes: [{ address: "0xabc" }] }, { status: 200 });
    await expect(siweApi.safes()).resolves.toEqual([{ address: "0xabc" }]);

    mockFetchOnce({ drafts: [{ id: "d1" }] }, { status: 200 });
    await expect(siweApi.listDrafts()).resolves.toEqual([{ id: "d1" }]);

    mockFetchOnce({ elections: [{ id: "e1" }] }, { status: 200 });
    await expect(siweApi.listElections()).resolves.toEqual([{ id: "e1" }]);
  });

  // Election ids are `${governorAddress}:${proposalId}`. An unencoded colon is
  // legal in a path segment but survives inconsistently through the proxy's
  // decode/re-encode, so we encode it here.
  it("encodes the colon in an election id", async () => {
    const spy = mockFetchOnce({ current: null, versions: [] }, { status: 200 });
    const electionId = "0xb7585Cb8:601626880";

    await siweApi.getMyCandidateProfile(electionId);

    const { url } = lastCall(spy);
    expect(url).toBe(
      "/api/governance-indexer/api/me/candidate-profile/0xb7585Cb8%3A601626880"
    );
    expect(url).not.toContain("Cb8:601");
  });

  it("PUTs candidate profiles as JSON to the encoded election path", async () => {
    const spy = mockFetchOnce({ version: 4 }, { status: 200 });

    await siweApi.putCandidateProfile("0xgov:7", {
      name: "Doug L.",
      title: null,
      twitter: null,
      type: null,
      representative: null,
      motivation: null,
      experience: null,
      skills: ["Solidity"],
      projects: null,
      country: null,
    });

    const { url, init } = lastCall(spy);
    expect(url).toContain("0xgov%3A7");
    expect(init?.method).toBe("PUT");
    expect(init?.headers).toEqual({ "content-type": "application/json" });
    expect(JSON.parse(String(init?.body)).skills).toEqual(["Solidity"]);
  });

  it("sends act-as as { safeAddress } and stop as a bodiless DELETE", async () => {
    const post = mockFetchOnce(
      { address: "0x1", actingAs: "0x2" },
      {
        status: 200,
      }
    );
    await siweApi.actAs("0x2");
    expect(JSON.parse(String(lastCall(post).init?.body))).toEqual({
      safeAddress: "0x2",
    });

    vi.restoreAllMocks();
    const del = mockFetchOnce(
      { address: "0x1", actingAs: null },
      {
        status: 200,
      }
    );
    await siweApi.stopActingAs();
    const { init } = lastCall(del);
    expect(init?.method).toBe("DELETE");
    expect(init?.body).toBeUndefined();
    expect(init?.headers).toBeUndefined();
  });

  // DELETE /api/me/drafts/:id answers 204 with no body; parse() must not choke
  // trying to JSON.parse "".
  it("tolerates the empty 204 body on draft delete", async () => {
    mockFetchOnce(undefined, { status: 204 });
    await expect(siweApi.deleteDraft("d1")).resolves.toBeUndefined();
  });

  // logout() used to fire-and-forget, so a failed sign-out looked successful
  // and the UI cleared the session locally while the server kept it alive. A
  // real failure is the proxy's 503 unconfigured / 502 upstream, not a 401.
  it("surfaces a failed logout instead of swallowing it", async () => {
    mockFetchOnce({ error: "Indexer upstream error." }, { status: 502 });
    await expect(siweApi.logout()).rejects.toBeInstanceOf(SiweApiError);
  });

  // 401 is not a failure here: a server with no session is exactly the state
  // sign-out was asking for, so the caller should not have to catch it.
  it("treats a 401 logout as already signed out", async () => {
    mockFetchOnce(
      { error: { code: "unauthorized", message: "no session" } },
      { status: 401 }
    );
    await expect(siweApi.logout()).resolves.toBeUndefined();
  });

  it("resolves logout on the empty 204 body", async () => {
    mockFetchOnce(undefined, { status: 204 });
    await expect(siweApi.logout()).resolves.toBeUndefined();
  });
});
