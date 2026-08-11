import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  blobDelete: vi.fn(),
  blobPut: vi.fn(),
  mkdir: vi.fn(),
  unlink: vi.fn(),
  writeFile: vi.fn(),
}));

vi.mock("@vercel/blob", () => ({
  del: mocks.blobDelete,
  put: mocks.blobPut,
}));

vi.mock("node:fs/promises", () => ({
  mkdir: mocks.mkdir,
  unlink: mocks.unlink,
  writeFile: mocks.writeFile,
}));

import { deleteManagedAvatar, putAvatar } from "./index";

describe("avatar storage", () => {
  const digest = "a".repeat(64);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("STORAGE_DRIVER", "local");
    mocks.mkdir.mockResolvedValue(undefined);
    mocks.unlink.mockResolvedValue(undefined);
    mocks.writeFile.mockResolvedValue(undefined);
  });

  it("uses content-addressed keys so staging cannot overwrite another image", async () => {
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

    expect(repeat.key).toBe(first.key);
    expect(replacement.key).not.toBe(first.key);
    expect(first.key).toMatch(/^0xabc\/[a-f0-9]{64}$/);
  });

  it("deletes a local image only when it belongs to the signed-in address", async () => {
    await deleteManagedAvatar("0xAbC", `/uploads/avatars/0xabc/${digest}`);
    expect(mocks.unlink).toHaveBeenCalledWith(
      expect.stringContaining(`/public/uploads/avatars/0xabc/${digest}`)
    );

    mocks.unlink.mockClear();
    await deleteManagedAvatar("0xAbC", `/uploads/avatars/0xdef/${digest}`);
    expect(mocks.unlink).not.toHaveBeenCalled();
  });

  it("rejects traversal-like local avatar paths", async () => {
    await deleteManagedAvatar(
      "0xAbC",
      "/uploads/avatars/0xabc/../../sensitive"
    );
    expect(mocks.unlink).not.toHaveBeenCalled();
  });

  it("ignores external URLs rather than treating them as managed blobs", async () => {
    await deleteManagedAvatar("0xAbC", "https://example.test/avatar.png");
    expect(mocks.blobDelete).not.toHaveBeenCalled();
  });

  it("rejects foreign hosts even when their path resembles a managed blob", async () => {
    await deleteManagedAvatar(
      "0xAbC",
      `https://example.test/governance-data/avatars/0xabc/${digest}`
    );
    expect(mocks.blobDelete).not.toHaveBeenCalled();
  });
});
