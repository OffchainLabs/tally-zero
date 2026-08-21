import { indexerErrorResponse, indexerFetch } from "@/lib/indexer/server";
import { commitAvatar } from "@/lib/profile/avatar";
import type { MeResponse } from "@/lib/siwe/types";

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
// (429). This route is the HTTP boundary only — staging the image, updating the
// profile and collecting the superseded copy all live in `commitAvatar`.
export async function POST(request: Request): Promise<Response> {
  const cookie = request.headers.get("cookie");
  if (!cookie) {
    return Response.json({ error: "Not signed in." }, { status: 401 });
  }

  const authorized = await authorize(cookie);
  if (authorized instanceof Response) return authorized;

  const image = await readImage(request);
  if (image instanceof Response) return image;

  const commit = await commitAvatar({ cookie, ...authorized, ...image });
  switch (commit.kind) {
    case "unreachable":
      return indexerErrorResponse(commit.error);
    case "rejected":
      return Response.json(
        {
          error:
            commit.status === 401
              ? "Not signed in."
              : "Avatar profile update failed.",
        },
        { status: commit.status < 500 ? commit.status : 502 }
      );
    case "committed":
      return Response.json(
        { url: commit.url },
        { headers: { "cache-control": "no-store" } }
      );
  }
}

/**
 * Authorize the upload at the indexer (session + delegated-ARB gate + rate
 * limit) and read the profile's current picture, which is what the commit will
 * supersede. Returns the error `Response` to send when either call fails.
 */
async function authorize(
  cookie: string
): Promise<{ address: string; previousPicture: string | null } | Response> {
  let intent: Response;
  let profile: Response;
  try {
    [intent, profile] = await Promise.all([
      indexerFetch("/api/me/avatar-intent", { method: "POST", cookie }),
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
  if (!profile.ok) {
    return Response.json(
      { error: "Unable to read the current profile." },
      { status: profile.status < 500 ? profile.status : 502 }
    );
  }

  const { address } = (await intent.json()) as { address: string };
  const me = (await profile.json()) as MeResponse;
  return { address, previousPicture: me.profile.picture };
}

/** Read the uploaded file, or the error `Response` explaining why we can't. */
async function readImage(
  request: Request
): Promise<{ bytes: Uint8Array; contentType: ImageContentType } | Response> {
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
  return { bytes, contentType };
}
