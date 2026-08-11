// Avatar image hosting. Vercel Blob in prod (BLOB_READ_WRITE_TOKEN), a local
// filesystem driver for dev/e2e (hermetic — no network/secret). Selected by
// STORAGE_DRIVER, defaulting to blob when a token is present, else local.
//
// Images are content-addressed. A new upload therefore cannot overwrite the
// image referenced by the current profile before that profile is updated.
export type StoredImage = {
  driver: "blob" | "local";
  key: string;
  url: string;
};

function resolveDriver(): "blob" | "local" {
  // eslint-disable-next-line no-process-env
  const explicit = process.env.STORAGE_DRIVER;
  if (explicit === "blob" || explicit === "local") return explicit;
  // eslint-disable-next-line no-process-env
  return process.env.BLOB_READ_WRITE_TOKEN ? "blob" : "local";
}

export async function putAvatar(
  address: string,
  bytes: Uint8Array,
  contentType: string
): Promise<StoredImage> {
  const { createHash } = await import("node:crypto");
  const digest = createHash("sha256").update(bytes).digest("hex");
  const key = `${address.toLowerCase()}/${digest}`;
  const driver = resolveDriver();

  if (driver === "blob") {
    const { put } = await import("@vercel/blob");
    const pathname = `governance-data/avatars/${key}`;
    const body = Uint8Array.from(bytes).buffer;
    const { url } = await put(pathname, body, {
      access: "public",
      // eslint-disable-next-line no-process-env
      token: process.env.BLOB_READ_WRITE_TOKEN,
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: contentType || undefined,
    });
    return { driver, key, url };
  }

  // Local driver: write under public/ so `next dev` serves it. Not used on
  // Vercel (read-only filesystem).
  const { mkdir, writeFile } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const dir = join(
    process.cwd(),
    "public",
    "uploads",
    "avatars",
    address.toLowerCase()
  );
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, digest), bytes);
  return { driver, key, url: `/uploads/avatars/${key}` };
}

/** Remove an image that was staged but could not be attached to the profile. */
export async function deleteStoredImage(image: StoredImage): Promise<void> {
  if (image.driver === "blob") {
    const { del } = await import("@vercel/blob");
    await del(image.url, {
      // eslint-disable-next-line no-process-env
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    return;
  }

  const { unlink } = await import("node:fs/promises");
  const { join } = await import("node:path");
  await unlink(join(process.cwd(), "public", "uploads", "avatars", image.key));
}

/** Delete a previous image only when its URL belongs to this address. */
export async function deleteManagedAvatar(
  address: string,
  imageUrl: string
): Promise<void> {
  const normalizedAddress = address.toLowerCase();
  const digestPattern = /^[a-f0-9]{64}$/;
  const localPrefix = "/uploads/avatars/";
  if (imageUrl.startsWith(localPrefix)) {
    const key = imageUrl.slice(localPrefix.length);
    const [owner, digest, extra] = key.split("/");
    const isOwned =
      owner === normalizedAddress &&
      (digest === undefined ||
        (digestPattern.test(digest) && extra === undefined));
    if (!isOwned) return;

    const { unlink } = await import("node:fs/promises");
    const { join } = await import("node:path");
    await unlink(join(process.cwd(), "public", "uploads", "avatars", key));
    return;
  }

  let image: URL;
  try {
    image = new URL(imageUrl);
  } catch {
    return;
  }
  if (!/(^|\.)blob\.vercel-storage\.com$/.test(image.hostname)) return;
  const pathname = image.pathname.replace(/^\/+/, "");

  const blobPrefix = "governance-data/avatars/";
  if (!pathname.startsWith(blobPrefix)) return;
  const [owner, digest, extra] = pathname.slice(blobPrefix.length).split("/");
  const isOwned =
    owner === normalizedAddress &&
    (digest === undefined ||
      (digestPattern.test(digest) && extra === undefined));
  if (!isOwned) {
    return;
  }

  const { del } = await import("@vercel/blob");
  await del(imageUrl, {
    // eslint-disable-next-line no-process-env
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });
}
