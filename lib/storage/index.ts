// Avatar image hosting. Vercel Blob in prod (BLOB_READ_WRITE_TOKEN), a local
// filesystem driver for dev/e2e (hermetic — no network/secret). Selected by
// STORAGE_DRIVER, defaulting to blob when a token is present, else local.
//
// Images are content-addressed under `<address>/<sha256>`, so a new upload
// cannot overwrite the image the current profile still points at. `putAvatar`
// builds that key and `deleteAvatar` recovers it from a URL, so the layout is
// declared once (below) and the ownership rule exists in one place.
export type StoredImage = { url: string };

type Driver = "blob" | "local";

const BLOB_PREFIX = "governance-data/avatars/";
const BLOB_HOST = /(^|\.)blob\.vercel-storage\.com$/;
const LOCAL_PREFIX = "/uploads/avatars/";
const DIGEST = /^[a-f0-9]{64}$/;

function resolveDriver(): Driver {
  // eslint-disable-next-line no-process-env
  const explicit = process.env.STORAGE_DRIVER;
  if (explicit === "blob" || explicit === "local") return explicit;
  // eslint-disable-next-line no-process-env
  return process.env.BLOB_READ_WRITE_TOKEN ? "blob" : "local";
}

async function localPath(key: string): Promise<string> {
  const { join } = await import("node:path");
  return join(process.cwd(), "public", "uploads", "avatars", ...key.split("/"));
}

export async function putAvatar(
  address: string,
  bytes: Uint8Array,
  contentType: string
): Promise<StoredImage> {
  const { createHash } = await import("node:crypto");
  const owner = address.toLowerCase();
  const digest = createHash("sha256").update(bytes).digest("hex");
  const key = `${owner}/${digest}`;

  if (resolveDriver() === "blob") {
    const { put } = await import("@vercel/blob");
    const { url } = await put(
      `${BLOB_PREFIX}${key}`,
      Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength),
      {
        access: "public",
        // eslint-disable-next-line no-process-env
        token: process.env.BLOB_READ_WRITE_TOKEN,
        addRandomSuffix: false,
        // Content-addressed, so an overwrite is byte-identical by construction.
        allowOverwrite: true,
        contentType: contentType || undefined,
      }
    );
    return { url };
  }

  // Local driver: write under public/ so `next dev` serves it. Not used on
  // Vercel (read-only filesystem).
  const { mkdir, rm, writeFile } = await import("node:fs/promises");
  const dir = await localPath(owner);
  // The pre-content-address layout stored a *file* at exactly this path. Drop
  // it so the per-address directory can take its place — a no-op once that
  // directory exists, since `rm` without `recursive` refuses directories.
  await rm(dir, { force: true }).catch(() => {});
  await mkdir(dir, { recursive: true });
  await writeFile(await localPath(key), bytes);
  return { url: `${LOCAL_PREFIX}${key}` };
}

/** A URL we host → the key it lives under, or null when it isn't ours. */
function parseAvatarUrl(
  imageUrl: string
): { driver: Driver; key: string } | null {
  if (imageUrl.startsWith(LOCAL_PREFIX)) {
    return { driver: "local", key: imageUrl.slice(LOCAL_PREFIX.length) };
  }

  let parsed: URL;
  try {
    parsed = new URL(imageUrl);
  } catch {
    return null;
  }
  if (!BLOB_HOST.test(parsed.hostname)) return null;

  const pathname = parsed.pathname.replace(/^\/+/, "");
  if (!pathname.startsWith(BLOB_PREFIX)) return null;
  return { driver: "blob", key: pathname.slice(BLOB_PREFIX.length) };
}

/**
 * Keys are `<address>/<sha256>`. A bare `<address>` is the pre-content-address
 * layout and is still recognised so those objects can be collected once.
 */
function isOwnedBy(key: string, address: string): boolean {
  const [owner, digest, ...rest] = key.split("/");
  if (owner !== address.toLowerCase() || rest.length > 0) return false;
  return digest === undefined || DIGEST.test(digest);
}

/** Delete an image we host, but only when it belongs to this address. */
export async function deleteAvatar(
  address: string,
  imageUrl: string
): Promise<void> {
  const target = parseAvatarUrl(imageUrl);
  if (!target || !isOwnedBy(target.key, address)) return;

  if (target.driver === "blob") {
    const { del } = await import("@vercel/blob");
    await del(imageUrl, {
      // eslint-disable-next-line no-process-env
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    return;
  }

  // A legacy local key is now a directory, and `putAvatar` already cleared the
  // file that used to sit there. public/uploads is gitignored dev scratch.
  if (!target.key.includes("/")) return;

  const { unlink } = await import("node:fs/promises");
  await unlink(await localPath(target.key));
}
