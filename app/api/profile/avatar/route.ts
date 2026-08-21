import { indexerErrorResponse, indexerFetch } from "@/lib/indexer/server";
import {
  deleteManagedAvatar,
  deleteStoredImage,
  putAvatar,
  type StoredImage,
} from "@/lib/storage";

export const dynamic = "force-dynamic";

const MAX_BYTES = 2_000_000;

type ImageContentType = "image/png" | "image/jpeg" | "image/gif" | "image/webp";

// Resolve the real image type from magic bytes rather than trusting the client
// content-type header (which is spoofable). Covers the formats browsers upload.
function sniffImage(bytes: Uint8Array): ImageContentType | null {
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
  if (png) return "image/png";
  if (jpeg) return "image/jpeg";
  if (gif) return "image/gif";
  if (webp) return "image/webp";
  return null;
}

// Authenticated avatar upload. Auth + anti-spam are delegated to the indexer's
// SIWE surface: POST /api/me/avatar-intent verifies the session, requires the
// address to hold delegated voting power (403), and rate-limits per address
// (429). The route then stages a content-addressed image and updates the
// profile itself. If the profile update fails, the staged image is removed so
// callers never observe an upload as successful while the profile is stale.
export async function POST(request: Request): Promise<Response> {
  const cookie = request.headers.get("cookie");
  if (!cookie) {
    return Response.json({ error: "Not signed in." }, { status: 401 });
  }

  // Authorize (session + delegated-ARB gate + rate limit) at the indexer.
  let intent: Response;
  let currentProfile: Response;
  try {
    [intent, currentProfile] = await Promise.all([
      indexerFetch("/api/me/avatar-intent", {
        method: "POST",
        cookie,
      }),
      indexerFetch("/api/me", { cookie }),
    ]);
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

  if (!currentProfile.ok) {
    return Response.json(
      { error: "Unable to read the current profile." },
      { status: currentProfile.status < 500 ? currentProfile.status : 502 }
    );
  }
  const previousPicture = readPreviousPicture(await currentProfile.json());

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
  const contentType = sniffImage(bytes);
  if (!contentType) {
    return Response.json(
      { error: "File is not a supported image (PNG, JPEG, GIF, WebP)." },
      { status: 400 }
    );
  }

  const stored = await putAvatar(address, bytes, contentType);

  let profileUpdate: Response;
  try {
    profileUpdate = await indexerFetch("/api/me/profile", {
      method: "PATCH",
      cookie,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ picture: stored.url }),
    });
  } catch (error) {
    await rollback(stored, previousPicture);
    return indexerErrorResponse(error);
  }

  if (!profileUpdate.ok) {
    await rollback(stored, previousPicture);
    return Response.json(
      {
        error:
          profileUpdate.status === 401
            ? "Not signed in."
            : "Avatar profile update failed.",
      },
      { status: profileUpdate.status < 500 ? profileUpdate.status : 502 }
    );
  }

  if (typeof previousPicture === "string" && previousPicture !== stored.url) {
    try {
      await deleteManagedAvatar(address, previousPicture);
    } catch (error) {
      console.error("Failed to remove the previous managed avatar.", error);
    }
  }

  return Response.json(
    { url: stored.url },
    { headers: { "cache-control": "no-store" } }
  );
}

async function rollback(
  image: StoredImage,
  previousPicture: unknown
): Promise<void> {
  if (previousPicture === image.url) return;

  try {
    await deleteStoredImage(image);
  } catch (error) {
    console.error("Failed to roll back staged avatar.", error);
  }
}

function readPreviousPicture(body: unknown): unknown {
  if (typeof body !== "object" || body === null || !("profile" in body)) {
    return undefined;
  }
  const profile = body.profile;
  if (
    typeof profile !== "object" ||
    profile === null ||
    !("picture" in profile)
  ) {
    return undefined;
  }
  return profile.picture;
}
