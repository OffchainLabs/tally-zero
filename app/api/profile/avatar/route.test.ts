import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  deleteManagedAvatar: vi.fn(),
  deleteStoredImage: vi.fn(),
  indexerErrorResponse: vi.fn(() =>
    Response.json({ error: "Indexer upstream error." }, { status: 502 })
  ),
  indexerFetch: vi.fn(),
  putAvatar: vi.fn(),
}));

vi.mock("@/lib/indexer/server", () => ({
  indexerErrorResponse: mocks.indexerErrorResponse,
  indexerFetch: mocks.indexerFetch,
}));

vi.mock("@/lib/storage", () => ({
  deleteManagedAvatar: mocks.deleteManagedAvatar,
  deleteStoredImage: mocks.deleteStoredImage,
  putAvatar: mocks.putAvatar,
}));

import { POST } from "./route";

const PNG = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00,
]);
const DIGEST = "a".repeat(64);

function uploadRequest() {
  const form = new FormData();
  form.set("file", new File([PNG], "avatar.png", { type: "image/png" }));
  return new Request("https://example.test/api/profile/avatar", {
    method: "POST",
    headers: { cookie: "siwe_session=token" },
    body: form,
  });
}

function jsonResponse(body: unknown, status = 200) {
  return Response.json(body, { status });
}

describe("profile avatar upload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.deleteManagedAvatar.mockResolvedValue(undefined);
    mocks.deleteStoredImage.mockResolvedValue(undefined);
    mocks.putAvatar.mockResolvedValue({
      driver: "local",
      key: `0xabc/${DIGEST}`,
      url: `/uploads/avatars/0xabc/${DIGEST}`,
    });
  });

  it("persists the profile pointer before reporting upload success", async () => {
    mocks.indexerFetch
      .mockResolvedValueOnce(jsonResponse({ address: "0xAbC" }))
      .mockResolvedValueOnce(
        jsonResponse({ profile: { picture: "/uploads/avatars/0xabc" } })
      )
      .mockResolvedValueOnce(jsonResponse({ owned: {}, resolved: {} }));

    const response = await POST(uploadRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      url: `/uploads/avatars/0xabc/${DIGEST}`,
    });
    expect(mocks.putAvatar).toHaveBeenCalledWith("0xAbC", PNG, "image/png");
    expect(mocks.indexerFetch).toHaveBeenNthCalledWith(3, "/api/me/profile", {
      method: "PATCH",
      cookie: "siwe_session=token",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ picture: `/uploads/avatars/0xabc/${DIGEST}` }),
    });
    expect(mocks.deleteManagedAvatar).toHaveBeenCalledWith(
      "0xAbC",
      "/uploads/avatars/0xabc"
    );
    expect(mocks.deleteStoredImage).not.toHaveBeenCalled();
  });

  it("rolls back the staged image when the profile update is rejected", async () => {
    mocks.indexerFetch
      .mockResolvedValueOnce(jsonResponse({ address: "0xAbC" }))
      .mockResolvedValueOnce(jsonResponse({ profile: { picture: null } }))
      .mockResolvedValueOnce(jsonResponse({ error: "write failed" }, 500));

    const response = await POST(uploadRequest());

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: "Avatar profile update failed.",
    });
    expect(mocks.deleteStoredImage).toHaveBeenCalledWith({
      driver: "local",
      key: `0xabc/${DIGEST}`,
      url: `/uploads/avatars/0xabc/${DIGEST}`,
    });
  });

  it("rolls back the staged image when the profile update cannot be reached", async () => {
    const upstreamError = new Error("offline");
    mocks.indexerFetch
      .mockResolvedValueOnce(jsonResponse({ address: "0xAbC" }))
      .mockResolvedValueOnce(jsonResponse({ profile: { picture: null } }))
      .mockRejectedValueOnce(upstreamError);

    const response = await POST(uploadRequest());

    expect(response.status).toBe(502);
    expect(mocks.indexerErrorResponse).toHaveBeenCalledWith(upstreamError);
    expect(mocks.deleteStoredImage).toHaveBeenCalledOnce();
  });

  it("keeps the live image when an identical upload cannot update the profile", async () => {
    const currentUrl = `/uploads/avatars/0xabc/${DIGEST}`;
    mocks.indexerFetch
      .mockResolvedValueOnce(jsonResponse({ address: "0xAbC" }))
      .mockResolvedValueOnce(jsonResponse({ profile: { picture: currentUrl } }))
      .mockResolvedValueOnce(jsonResponse({ error: "write failed" }, 500));

    const response = await POST(uploadRequest());

    expect(response.status).toBe(502);
    expect(mocks.deleteStoredImage).not.toHaveBeenCalled();
  });
});
