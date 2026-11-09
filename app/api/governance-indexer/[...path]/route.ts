import { indexerErrorResponse, indexerFetch } from "@/lib/indexer/server";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

// Single handler for every method. GET reads stay CDN-cacheable; the SIWE
// surface (POST /api/auth/*, GET/PATCH /api/me, ...) is cookie-based, so we
// forward the request body + inbound `cookie`, relay upstream `set-cookie`, and
// never shared-cache anything that carries credentials.
// The indexer rate-limits sign-in per client. This proxy calls it
// server-to-server, so without this every user would share the deployment's
// egress IP. Vercel's edge sets x-real-ip and overwrites any client-supplied
// x-forwarded-for, so the caller's address here is trustworthy; the indexer
// counts TRUSTED_PROXY_HOPS from the right to reach it.
function callerIp(request: Request): string | null {
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0];
  return forwarded?.trim() || null;
}

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
  const ip = callerIp(request);

  try {
    const upstream = await indexerFetch(`/${encodedPath}${inboundUrl.search}`, {
      method,
      cookie,
      redirect: "manual",
      body: hasBody ? await request.arrayBuffer() : undefined,
      headers: {
        ...(contentType ? { "content-type": contentType } : {}),
        ...(ip ? { "x-forwarded-for": ip } : {}),
      },
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
