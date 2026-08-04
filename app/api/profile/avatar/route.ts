import { putAvatar } from "@/lib/storage";

export const dynamic = "force-dynamic";

const MAX_BYTES = 5_000_000;

function getIndexerUrl(): string | null {
  // eslint-disable-next-line no-process-env
  const value = process.env.GOVERNANCE_INDEXER_URL?.trim();
  return value ? value.replace(/\/+$/, "") : null;
}

// Authenticated avatar upload. Auth is delegated to the indexer's SIWE
// session: we forward the caller's cookie to GET /api/me; only a valid session
// yields the address the image is stored under. The returned URL is then saved
// into the profile's `picture` field via PATCH /api/me/profile (client-side).
export async function POST(request: Request): Promise<Response> {
  const indexerUrl = getIndexerUrl();
  if (!indexerUrl) {
    return Response.json(
      { error: "Governance indexer is not configured." },
      { status: 503 }
    );
  }

  const cookie = request.headers.get("cookie");
  if (!cookie) {
    return Response.json({ error: "Not signed in." }, { status: 401 });
  }

  const meRes = await fetch(`${indexerUrl}/api/me`, {
    headers: { accept: "application/json", cookie },
  });
  if (meRes.status !== 200) {
    return Response.json({ error: "Not signed in." }, { status: 401 });
  }
  const me = (await meRes.json()) as {
    address: string;
    effectiveAddress?: string;
  };
  const address = me.effectiveAddress ?? me.address;

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "Missing 'file'." }, { status: 400 });
  }
  if (!file.type.startsWith("image/")) {
    return Response.json({ error: "File must be an image." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return Response.json(
      { error: "Image too large (max 5MB)." },
      { status: 413 }
    );
  }

  const { url } = await putAvatar(address, file);
  return Response.json({ url }, { headers: { "cache-control": "no-store" } });
}
