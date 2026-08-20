import { indexerErrorResponse, indexerFetch } from "@/lib/indexer/server";
import { putAvatar } from "@/lib/storage";

export const dynamic = "force-dynamic";

const MAX_BYTES = 2_000_000;

// Sniff the real image type from magic bytes rather than trusting the client
// content-type header (which is spoofable). Covers the formats browsers upload.
function sniffImage(bytes: Uint8Array): boolean {
  const b = bytes;
  const png = b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
  const jpeg = b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  const gif = b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46;
  const webp =
    b[0] === 0x52 &&
    b[1] === 0x49 &&
    b[2] === 0x46 &&
    b[3] === 0x46 &&
    b[8] === 0x57 &&
    b[9] === 0x45 &&
    b[10] === 0x42 &&
    b[11] === 0x50;
  return png || jpeg || gif || webp;
}

// Authenticated avatar upload. Auth + anti-spam are delegated to the indexer's
// SIWE surface: POST /api/me/avatar-intent verifies the session, requires the
// address to hold delegated voting power (403), and rate-limits per address
// (429). Only then do we accept and store the image; the returned URL is saved
// into the profile's `picture` field via PATCH /api/me/profile (client-side).
export async function POST(request: Request): Promise<Response> {
  const cookie = request.headers.get("cookie");
  if (!cookie) {
    return Response.json({ error: "Not signed in." }, { status: 401 });
  }

  // Authorize (session + delegated-ARB gate + rate limit) at the indexer.
  let intent: Response;
  try {
    intent = await indexerFetch("/api/me/avatar-intent", {
      method: "POST",
      cookie,
    });
  } catch (error) {
    return indexerErrorResponse(error);
  }
  if (intent.status === 401) {
    return Response.json({ error: "Not signed in." }, { status: 401 });
  }
  if (intent.status === 403) {
    return Response.json(
      { error: "Only delegates with voting power can upload an avatar." },
      { status: 403 }
    );
  }
  if (intent.status === 429) {
    return Response.json(
      { error: "Too many avatar uploads; try again later." },
      { status: 429 }
    );
  }
  if (intent.status !== 200) {
    return Response.json({ error: "Upload not authorized." }, { status: 502 });
  }
  const { address } = (await intent.json()) as { address: string };

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "Missing 'file'." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return Response.json(
      { error: "Image too large (max 2MB)." },
      { status: 413 }
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!sniffImage(bytes)) {
    return Response.json(
      { error: "File is not a supported image (PNG, JPEG, GIF, WebP)." },
      { status: 400 }
    );
  }

  const { url } = await putAvatar(address, file);
  return Response.json({ url }, { headers: { "cache-control": "no-store" } });
}
