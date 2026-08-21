import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  deleteAvatar: vi.fn(),
  indexerFetch: vi.fn(),
  putAvatar: vi.fn(),
}));

vi.mock("@/lib/indexer/server", () => ({
  indexerFetch: mocks.indexerFetch,
}));

vi.mock("@/lib/storage", () => ({
  deleteAvatar: mocks.deleteAvatar,
  putAvatar: mocks.putAvatar,
}));

import { commitAvatar } from "./avatar";

const DIGEST = "a".repeat(64);
const STAGED = `/uploads/avatars/0xabc/${DIGEST}`;
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47]);

function commit(previousPicture: string | null) {
  return commitAvatar({
    address: "0xAbC",
    cookie: "siwe_session=token",
    bytes: PNG,
    contentType: "image/png",
    previousPicture,
  });
}

describe("commitAvatar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.deleteAvatar.mockResolvedValue(undefined);
    mocks.putAvatar.mockResolvedValue({ url: STAGED });
  });

  it("points the profile at the staged image before reporting success", async () => {
    mocks.indexerFetch.mockResolvedValue(Response.json({ owned: {} }));

    await expect(commit(null)).resolves.toEqual({
      kind: "committed",
      url: STAGED,
    });
    expect(mocks.putAvatar).toHaveBeenCalledWith("0xAbC", PNG, "image/png");
    expect(mocks.indexerFetch).toHaveBeenCalledWith("/api/me/profile", {
      method: "PATCH",
      cookie: "siwe_session=token",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ picture: STAGED }),
    });
  });

  it("collects the superseded image once the commit lands", async () => {
    mocks.indexerFetch.mockResolvedValue(Response.json({ owned: {} }));

    await commit("/uploads/avatars/0xabc/old");

    expect(mocks.deleteAvatar).toHaveBeenCalledWith(
      "0xAbC",
      "/uploads/avatars/0xabc/old"
    );
  });

  it("rolls the staged image back when the profile update is rejected", async () => {
    mocks.indexerFetch.mockResolvedValue(
      Response.json({ error: "write failed" }, { status: 500 })
    );

    await expect(commit(null)).resolves.toEqual({
      kind: "rejected",
      status: 500,
    });
    expect(mocks.deleteAvatar).toHaveBeenCalledWith("0xAbC", STAGED);
  });

  it("rolls back when the indexer cannot be reached", async () => {
    const error = new Error("offline");
    mocks.indexerFetch.mockRejectedValue(error);

    await expect(commit(null)).resolves.toEqual({
      kind: "unreachable",
      error,
    });
    expect(mocks.deleteAvatar).toHaveBeenCalledWith("0xAbC", STAGED);
  });

  it("keeps the live image when an identical re-upload cannot be committed", async () => {
    mocks.indexerFetch.mockResolvedValue(
      Response.json({ error: "write failed" }, { status: 500 })
    );

    await commit(STAGED);

    expect(mocks.deleteAvatar).not.toHaveBeenCalled();
  });

  it("does not delete anything when there was no previous image", async () => {
    mocks.indexerFetch.mockResolvedValue(Response.json({ owned: {} }));

    await commit(null);

    expect(mocks.deleteAvatar).not.toHaveBeenCalled();
  });

  it("survives a failed collection rather than failing the upload", async () => {
    mocks.indexerFetch.mockResolvedValue(Response.json({ owned: {} }));
    mocks.deleteAvatar.mockRejectedValue(new Error("storage down"));
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    await expect(commit("/uploads/avatars/0xabc/old")).resolves.toEqual({
      kind: "committed",
      url: STAGED,
    });

    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
