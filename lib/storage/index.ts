// Avatar image hosting. Vercel Blob in prod (BLOB_READ_WRITE_TOKEN), a local
// filesystem driver for dev/e2e (hermetic — no network/secret). Selected by
// STORAGE_DRIVER, defaulting to blob when a token is present, else local.
// Mirrors the existing bucket layout (governance-data/avatars/<address>.<ext>)
// used by scripts/upload-governance-avatars.ts.
export type StoredImage = { url: string };

function resolveDriver(): "blob" | "local" {
  // eslint-disable-next-line no-process-env
  const explicit = process.env.STORAGE_DRIVER;
  if (explicit === "blob" || explicit === "local") return explicit;
  // eslint-disable-next-line no-process-env
  return process.env.BLOB_READ_WRITE_TOKEN ? "blob" : "local";
}

function extensionFor(file: File): string {
  const fromName = file.name.match(/\.[a-z0-9]+$/i)?.[0];
  if (fromName) return fromName.toLowerCase();
  const fromType = file.type.split("/")[1];
  return fromType ? `.${fromType}` : ".jpg";
}

export async function putAvatar(
  address: string,
  file: File
): Promise<StoredImage> {
  const key = address.toLowerCase();
  const ext = extensionFor(file);
  const pathname = `governance-data/avatars/${key}${ext}`;

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
  // site-root URL that <img>/next-image can load. Not used on Vercel (the
  // filesystem is read-only there).
  const { mkdir, writeFile } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const dir = join(process.cwd(), "public", "uploads", "avatars");
  await mkdir(dir, { recursive: true });
  const filename = `${key}${ext}`;
  await writeFile(join(dir, filename), Buffer.from(await file.arrayBuffer()));
  return { url: `/uploads/avatars/${filename}` };
}
