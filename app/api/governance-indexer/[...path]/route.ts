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

export async function GET(
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

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const upstream = await fetch(upstreamUrl, {
      method: "GET",
      signal: controller.signal,
      headers: { accept: "application/json" },
    });

    const headers = new Headers();
    headers.set("content-type", "application/json");
    headers.set(
      "cache-control",
      "public, s-maxage=30, stale-while-revalidate=300"
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
