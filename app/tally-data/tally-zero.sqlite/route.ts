const DEFAULT_BLOB_URL =
  "https://epodj1k6qull8rb3.public.blob.vercel-storage.com/governance-data/delegates.sqlite";
const DB_SIZE_BYTES = 197480448;
const MAX_RANGE_BYTES = 4 * 1024 * 1024;
const UPSTREAM_CACHE_HEADERS = ["etag", "last-modified"] as const;

type ParsedRange =
  | {
      isValid: true;
      header: string;
    }
  | {
      isValid: false;
      status: 400 | 416;
    };

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getBlobUrl(): string {
  return (
    process.env.GOVERNANCE_DATA_SQLITE_BLOB_URL ??
    process.env.TALLY_DATA_SQLITE_BLOB_URL ??
    DEFAULT_BLOB_URL
  );
}

function headersForResponse(extraHeaders?: HeadersInit): Headers {
  const headers = new Headers();
  headers.set("Accept-Ranges", "bytes");
  headers.set(
    "Cache-Control",
    "public, max-age=31536000, immutable, no-transform"
  );
  headers.set("Content-Encoding", "identity");
  headers.set("Content-Type", "application/octet-stream");
  headers.set("Content-Length", String(DB_SIZE_BYTES));
  headers.set("Content-Disposition", 'inline; filename="tally-zero.sqlite"');
  if (extraHeaders) {
    new Headers(extraHeaders).forEach((value, key) => {
      headers.set(key, value);
    });
  }
  return headers;
}

function getUpstreamCacheHeaders(upstreamHeaders: Headers): Headers {
  const headers = new Headers();

  for (const headerName of UPSTREAM_CACHE_HEADERS) {
    const value = upstreamHeaders.get(headerName);
    if (value) headers.set(headerName, value);
  }

  return headers;
}

function rangeNotSatisfiable(): Response {
  return new Response(null, {
    status: 416,
    headers: headersForResponse({
      "Content-Range": `bytes */${DB_SIZE_BYTES}`,
      "Content-Length": "0",
    }),
  });
}

export function parseRangeHeader(range: string | null): ParsedRange {
  if (!range) return { isValid: false, status: 400 };

  const match = /^bytes=(\d+)-(\d+)$/.exec(range.trim());
  if (!match) return { isValid: false, status: 416 };

  const start = Number(match[1]);
  const end = Number(match[2]);
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)) {
    return { isValid: false, status: 416 };
  }
  if (start > end || start >= DB_SIZE_BYTES || end >= DB_SIZE_BYTES) {
    return { isValid: false, status: 416 };
  }
  if (end - start + 1 > MAX_RANGE_BYTES) {
    return { isValid: false, status: 416 };
  }

  return { isValid: true, header: `bytes=${start}-${end}` };
}

export async function HEAD(): Promise<Response> {
  try {
    const blobResponse = await fetch(getBlobUrl(), { method: "HEAD" });
    if (blobResponse.ok) {
      return new Response(null, {
        status: 200,
        headers: headersForResponse(
          getUpstreamCacheHeaders(blobResponse.headers)
        ),
      });
    }
  } catch {
    // Static byte-serving metadata is enough for sql.js-httpvfs to proceed.
  }

  return new Response(null, {
    status: 200,
    headers: headersForResponse(),
  });
}

export async function GET(request: Request): Promise<Response> {
  const range = parseRangeHeader(request.headers.get("range"));
  if (!range.isValid) {
    if (range.status === 400) {
      return new Response("Range header is required", {
        status: 400,
        headers: headersForResponse({
          "Content-Length": String("Range header is required".length),
        }),
      });
    }
    return rangeNotSatisfiable();
  }

  const blobResponse = await fetch(getBlobUrl(), {
    headers: { range: range.header },
  });

  if (!blobResponse.ok && blobResponse.status !== 206) {
    return new Response(blobResponse.body, {
      status: blobResponse.status,
      statusText: blobResponse.statusText,
    });
  }

  const headers = headersForResponse(
    getUpstreamCacheHeaders(blobResponse.headers)
  );
  const contentRange = blobResponse.headers.get("content-range");
  const contentLength = blobResponse.headers.get("content-length");

  if (contentRange) headers.set("Content-Range", contentRange);
  if (contentLength) headers.set("Content-Length", contentLength);

  return new Response(blobResponse.body, {
    status: blobResponse.status,
    statusText: blobResponse.statusText,
    headers,
  });
}
