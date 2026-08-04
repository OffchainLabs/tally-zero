export const dynamic = "force-dynamic";

const FETCH_TIMEOUT_MS = 10_000;

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

function getIndexerUrl(): string | null {
  // eslint-disable-next-line no-process-env
  const value = process.env.GOVERNANCE_INDEXER_URL?.trim();
  return value ? value.replace(/\/+$/, "") : null;
}

// Single handler for every method. GET reads stay CDN-cacheable; the SIWE
// surface (POST /api/auth/*, GET/PATCH /api/me, ...) is cookie-based, so we
// forward the request body + inbound `cookie`, relay upstream `set-cookie`, and
// never shared-cache anything that carries credentials.
async function proxy(
  request: Request,
  context: RouteContext
): Promise<Response> {
  const { path } = await context.params;
  const indexerUrl = getIndexerUrl();
  if (!indexerUrl) {
    return Response.json(
      { error: "Governance indexer is not configured." },
      { status: 503 }
    );
  }

  const inboundUrl = new URL(request.url);
  const encodedPath = path.map(encodeURIComponent).join("/");
  const upstreamUrl = new URL(`${indexerUrl}/${encodedPath}`);
  upstreamUrl.search = inboundUrl.search;

  const method = request.method;
  const hasBody = method !== "GET" && method !== "HEAD";
  const cookie = request.headers.get("cookie");

  const outHeaders: Record<string, string> = { accept: "application/json" };
  const contentType = request.headers.get("content-type");
  if (contentType) outHeaders["content-type"] = contentType;
  if (cookie) outHeaders["cookie"] = cookie;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const upstream = await fetch(upstreamUrl, {
      method,
      signal: controller.signal,
      headers: outHeaders,
      body: hasBody ? await request.arrayBuffer() : undefined,
      redirect: "manual",
    });

    const headers = new Headers();
    headers.set(
      "content-type",
      upstream.headers.get("content-type") ?? "application/json"
    );
    // Relay session cookies (verify sets siwe_session; logout clears it).
    for (const value of upstream.headers.getSetCookie()) {
      headers.append("set-cookie", value);
    }
    // Only shared-cache anonymous GETs; anything with credentials is per-user.
    headers.set(
      "cache-control",
      method === "GET" && !cookie
        ? "public, s-maxage=30, stale-while-revalidate=300"
        : "no-store"
    );

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers,
    });
  } catch {
    return Response.json({ error: "Indexer upstream error." }, { status: 502 });
  } finally {
    clearTimeout(timer);
  }
}

export const GET = proxy;
export const POST = proxy;
export const PATCH = proxy;
export const PUT = proxy;
export const DELETE = proxy;
