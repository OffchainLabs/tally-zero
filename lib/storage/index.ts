// Avatar image hosting. Vercel Blob in prod (BLOB_READ_WRITE_TOKEN), a local
// filesystem driver for dev/e2e (hermetic — no network/secret). Selected by
// STORAGE_DRIVER, defaulting to blob when a token is present, else local.
//
// The pathname is deterministic and EXTENSION-LESS
// (governance-data/avatars/<address>): one object per address, so re-uploading
// a different format overwrites the same object instead of leaving orphans
// (bounds storage per address). Blob stores the real content-type as metadata
// and serves it, so <img> renders correctly despite no extension in the URL.
export type StoredImage = { url: string };

function resolveDriver(): "blob" | "local" {
  // eslint-disable-next-line no-process-env
  const explicit = process.env.STORAGE_DRIVER;
  if (explicit === "blob" || explicit === "local") return explicit;
  // eslint-disable-next-line no-process-env
  return process.env.BLOB_READ_WRITE_TOKEN ? "blob" : "local";
}

export async function putAvatar(
  address: string,
  file: File
): Promise<StoredImage> {
  const key = address.toLowerCase();
  const pathname = `governance-data/avatars/${key}`;

  if (resolveDriver() === "blob") {
    const { put } = await import("@vercel/blob");
    const { url } = await put(pathname, file, {
      access: "public",
      // eslint-disable-next-line no-process-env
      token: process.env.BLOB_READ_WRITE_TOKEN,
      allowOverwrite: true,
      contentType: file.type || undefined,
    });
    return { url };
  }

  // Local driver: write under public/ so `next dev` serves it, and return a
  // site-root URL that <img> can load (browsers content-sniff images, so the
  // missing extension is fine). Not used on Vercel (read-only filesystem).
  const { mkdir, writeFile } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const dir = join(process.cwd(), "public", "uploads", "avatars");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, key), Buffer.from(await file.arrayBuffer()));
  return { url: `/uploads/avatars/${key}` };
}
