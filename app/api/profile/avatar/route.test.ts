import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  commitAvatar: vi.fn(),
  indexerErrorResponse: vi.fn(() =>
    Response.json({ error: "Indexer upstream error." }, { status: 502 })
  ),
  indexerFetch: vi.fn(),
}));

vi.mock("@/lib/indexer/server", () => ({
  indexerErrorResponse: mocks.indexerErrorResponse,
  indexerFetch: mocks.indexerFetch,
}));

vi.mock("@/lib/profile/avatar", () => ({
  commitAvatar: mocks.commitAvatar,
}));

import { POST } from "./route";

const PNG = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00,
]);
const DIGEST = "a".repeat(64);
const STAGED = `/uploads/avatars/0xabc/${DIGEST}`;

function uploadRequest(body?: FormData) {
  const form = body ?? new FormData();
  if (!body)
    form.set("file", new File([PNG], "avatar.png", { type: "image/png" }));
  return new Request("https://example.test/api/profile/avatar", {
    method: "POST",
    headers: { cookie: "siwe_session=token" },
    body: form,
  });
}

/** avatar-intent, then GET /api/me. */
function authorizeWith(picture: string | null) {
  mocks.indexerFetch
    .mockResolvedValueOnce(Response.json({ address: "0xAbC" }))
    .mockResolvedValueOnce(
      Response.json({ address: "0xAbC", profile: { picture } })
    );
}

describe("profile avatar upload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.commitAvatar.mockResolvedValue({ kind: "committed", url: STAGED });
  });

  it("rejects an unauthenticated request before touching the indexer", async () => {
    const response = await POST(
      new Request("https://example.test/api/profile/avatar", { method: "POST" })
    );

    expect(response.status).toBe(401);
    expect(mocks.indexerFetch).not.toHaveBeenCalled();
  });

  it("passes the address and the superseded picture to the commit", async () => {
    authorizeWith("/uploads/avatars/0xabc/old");

    const response = await POST(uploadRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ url: STAGED });
    expect(mocks.commitAvatar).toHaveBeenCalledWith({
      address: "0xAbC",
      cookie: "siwe_session=token",
      bytes: PNG,
      contentType: "image/png",
      previousPicture: "/uploads/avatars/0xabc/old",
    });
  });

  it.each([
    [
      403,
      "Uploading an avatar requires at least 5,000 ARB of voting power. " +
        "Your delegated ARB is below that threshold.",
    ],
    [429, "Too many avatar uploads; try again later."],
    [401, "Not signed in."],
  ])("relays a %i from the avatar-intent gate", async (status, error) => {
    mocks.indexerFetch
      .mockResolvedValueOnce(Response.json({ error: "no" }, { status }))
      .mockResolvedValueOnce(Response.json({ profile: { picture: null } }));

    const response = await POST(uploadRequest());

    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toEqual({ error });
    expect(mocks.commitAvatar).not.toHaveBeenCalled();
  });

  it("fails closed when the current profile cannot be read", async () => {
    mocks.indexerFetch
      .mockResolvedValueOnce(Response.json({ address: "0xAbC" }))
      .mockResolvedValueOnce(Response.json({ error: "boom" }, { status: 500 }));

    const response = await POST(uploadRequest());

    expect(response.status).toBe(502);
    expect(mocks.commitAvatar).not.toHaveBeenCalled();
  });

  it("maps an unreachable indexer through indexerErrorResponse", async () => {
    const error = new Error("offline");
    mocks.indexerFetch.mockRejectedValue(error);

    const response = await POST(uploadRequest());

    expect(response.status).toBe(502);
    expect(mocks.indexerErrorResponse).toHaveBeenCalledWith(error);
  });

  it("rejects a payload that is not a supported image", async () => {
    authorizeWith(null);
    const form = new FormData();
    form.set("file", new File([Uint8Array.from([1, 2, 3])], "x.png"));

    const response = await POST(uploadRequest(form));

    expect(response.status).toBe(400);
    expect(mocks.commitAvatar).not.toHaveBeenCalled();
  });

  it("reports a rejected commit as a bad gateway", async () => {
    authorizeWith(null);
    mocks.commitAvatar.mockResolvedValue({ kind: "rejected", status: 500 });

    const response = await POST(uploadRequest());

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: "Avatar profile update failed.",
    });
  });

  it("reports an unreachable commit through indexerErrorResponse", async () => {
    authorizeWith(null);
    const error = new Error("offline");
    mocks.commitAvatar.mockResolvedValue({ kind: "unreachable", error });

    const response = await POST(uploadRequest());

    expect(response.status).toBe(502);
    expect(mocks.indexerErrorResponse).toHaveBeenCalledWith(error);
  });
});
