const DEFAULT_BLOB_URL =
  "https://tjofhnztd1vo0kie.public.blob.vercel-storage.com/tally-data/tally-zero-delegate-list.sqlite";
const DB_SIZE_BYTES = 198082560;
const MAX_RANGE_BYTES = 4 * 1024 * 1024;

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
    process.env.TALLY_DATA_SQLITE_BLOB_URL ??
    process.env.NEXT_PUBLIC_TALLY_DATA_SQLITE_URL ??
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

export function HEAD(): Response {
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

  const headers = headersForResponse();
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
