/**
 * Route Handler: GET /api/forum/topic?id=<topicId>
 *
 * Fetches the first post of an Arbitrum governance forum topic server-side so
 * the browser does not have to go through a third-party CORS proxy. Scope is
 * narrow on purpose: topic id goes in, { title, body } comes out. The upstream
 * host is hardcoded, never read from user input, so there is no SSRF surface.
 */

export const dynamic = "force-dynamic";

const FORUM_HOST = "forum.arbitrum.foundation";
const MAX_BYTES = 512 * 1024;
const FETCH_TIMEOUT_MS = 8_000;

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id") ?? "";
  if (!/^\d{1,12}$/.test(id)) {
    return Response.json({ error: "Invalid topic id." }, { status: 400 });
  }

  const topicUrl = `https://${FORUM_HOST}/t/${id}.json`;
  const rawUrl = `https://${FORUM_HOST}/raw/${id}/1`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const [topicRes, rawRes] = await Promise.all([
      fetch(topicUrl, { signal: controller.signal }),
      fetch(rawUrl, { signal: controller.signal }),
    ]);

    if (topicRes.status === 404 || rawRes.status === 404) {
      return Response.json(
        { error: "Forum topic not found." },
        { status: 404 }
      );
    }
    if (!topicRes.ok || !rawRes.ok) {
      return Response.json({ error: "Upstream error." }, { status: 502 });
    }

    const [topicText, body] = await Promise.all([
      readWithCap(topicRes, MAX_BYTES),
      readWithCap(rawRes, MAX_BYTES),
    ]);

    let title = "";
    try {
      const parsed = JSON.parse(topicText) as { title?: unknown };
      if (typeof parsed.title === "string") title = parsed.title.trim();
    } catch {
      // Topic JSON malformed; fall through with empty title.
    }

    if (!body.trim()) {
      return Response.json({ error: "Empty forum post." }, { status: 502 });
    }

    return Response.json(
      { title, body },
      {
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600",
        },
      }
    );
  } catch {
    return Response.json({ error: "Upstream error." }, { status: 502 });
  } finally {
    clearTimeout(timer);
  }
}

async function readWithCap(res: Response, limit: number): Promise<string> {
  const contentLength = res.headers.get("content-length");
  if (contentLength) {
    const declared = Number(contentLength);
    if (Number.isFinite(declared) && declared > limit) {
      throw new Error("upstream-too-large");
    }
  }
  const text = await res.text();
  if (text.length > limit) {
    throw new Error("upstream-too-large");
  }
  return text;
}
