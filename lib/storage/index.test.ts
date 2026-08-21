import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  blobDelete: vi.fn(),
  blobPut: vi.fn(),
  mkdir: vi.fn(),
  rm: vi.fn(),
  unlink: vi.fn(),
  writeFile: vi.fn(),
}));

vi.mock("@vercel/blob", () => ({
  del: mocks.blobDelete,
  put: mocks.blobPut,
}));

vi.mock("node:fs/promises", () => ({
  mkdir: mocks.mkdir,
  rm: mocks.rm,
  unlink: mocks.unlink,
  writeFile: mocks.writeFile,
}));

import { deleteAvatar, putAvatar } from "./index";

describe("avatar storage", () => {
  const digest = "a".repeat(64);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("STORAGE_DRIVER", "local");
    mocks.mkdir.mockResolvedValue(undefined);
    mocks.rm.mockResolvedValue(undefined);
    mocks.unlink.mockResolvedValue(undefined);
    mocks.writeFile.mockResolvedValue(undefined);
  });

  it("uses content-addressed URLs so staging cannot overwrite another image", async () => {
    const first = await putAvatar(
      "0xAbC",
      Uint8Array.from([1, 2, 3]),
      "image/png"
    );
    const repeat = await putAvatar(
      "0xAbC",
      Uint8Array.from([1, 2, 3]),
      "image/png"
    );
    const replacement = await putAvatar(
      "0xAbC",
      Uint8Array.from([4, 5, 6]),
      "image/png"
    );

    expect(repeat.url).toBe(first.url);
    expect(replacement.url).not.toBe(first.url);
    expect(first.url).toMatch(/^\/uploads\/avatars\/0xabc\/[a-f0-9]{64}$/);
  });

  it("clears a pre-content-address file occupying the per-address directory", async () => {
    await putAvatar("0xAbC", Uint8Array.from([1]), "image/png");

    expect(mocks.rm).toHaveBeenCalledWith(
      expect.stringContaining("/public/uploads/avatars/0xabc"),
      { force: true }
    );
  });

  it("round-trips a stored URL back to the file it wrote", async () => {
    const { url } = await putAvatar("0xAbC", Uint8Array.from([1]), "image/png");

    await deleteAvatar("0xAbC", url);

    expect(mocks.unlink).toHaveBeenCalledWith(
      expect.stringContaining(`/public/uploads/avatars/0xabc/`)
    );
  });

  it("deletes a local image only when it belongs to the signed-in address", async () => {
    await deleteAvatar("0xAbC", `/uploads/avatars/0xabc/${digest}`);
    expect(mocks.unlink).toHaveBeenCalledWith(
      expect.stringContaining(`/public/uploads/avatars/0xabc/${digest}`)
    );

    mocks.unlink.mockClear();
    await deleteAvatar("0xAbC", `/uploads/avatars/0xdef/${digest}`);
    expect(mocks.unlink).not.toHaveBeenCalled();
  });

  it("rejects traversal-like local avatar paths", async () => {
    await deleteAvatar("0xAbC", "/uploads/avatars/0xabc/../../sensitive");
    expect(mocks.unlink).not.toHaveBeenCalled();
  });

  it("leaves a legacy local key alone, since putAvatar already cleared it", async () => {
    await deleteAvatar("0xAbC", "/uploads/avatars/0xabc");
    expect(mocks.unlink).not.toHaveBeenCalled();
  });

  it("still collects a legacy blob object for the same address", async () => {
    const url =
      "https://store.public.blob.vercel-storage.com/governance-data/avatars/0xabc";

    await deleteAvatar("0xAbC", url);

    expect(mocks.blobDelete).toHaveBeenCalledWith(url, expect.anything());
  });

  it("ignores external URLs rather than treating them as managed blobs", async () => {
    await deleteAvatar("0xAbC", "https://example.test/avatar.png");
    expect(mocks.blobDelete).not.toHaveBeenCalled();
  });

  it("rejects foreign hosts even when their path resembles a managed blob", async () => {
    await deleteAvatar(
      "0xAbC",
      `https://example.test/governance-data/avatars/0xabc/${digest}`
    );
    expect(mocks.blobDelete).not.toHaveBeenCalled();
  });
});
