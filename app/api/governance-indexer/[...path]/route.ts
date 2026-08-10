import { indexerErrorResponse, indexerFetch } from "@/lib/indexer/server";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

// Single handler for every method. GET reads stay CDN-cacheable; the SIWE
// surface (POST /api/auth/*, GET/PATCH /api/me, ...) is cookie-based, so we
// forward the request body + inbound `cookie`, relay upstream `set-cookie`, and
// never shared-cache anything that carries credentials.
async function proxy(
  request: Request,
  context: RouteContext
): Promise<Response> {
  const { path } = await context.params;
  const inboundUrl = new URL(request.url);
  const encodedPath = path.map(encodeURIComponent).join("/");

  const method = request.method;
  const hasBody = method !== "GET" && method !== "HEAD";
  const cookie = request.headers.get("cookie");
  const contentType = request.headers.get("content-type");

  try {
    const upstream = await indexerFetch(`/${encodedPath}${inboundUrl.search}`, {
      method,
      cookie,
      redirect: "manual",
      body: hasBody ? await request.arrayBuffer() : undefined,
      headers: contentType ? { "content-type": contentType } : undefined,
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
  } catch (error) {
    return indexerErrorResponse(error);
  }
}

export const GET = proxy;
export const POST = proxy;
export const PATCH = proxy;
export const PUT = proxy;
export const DELETE = proxy;
