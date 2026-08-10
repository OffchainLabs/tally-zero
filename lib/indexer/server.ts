// Server-side access to the governance indexer. `GOVERNANCE_INDEXER_URL` is a
// server-only env var (no NEXT_PUBLIC_ prefix); the browser always talks to the
// same-origin routes under app/api, never the indexer directly. Imported only
// by route handlers (themselves server-only).

const DEFAULT_TIMEOUT_MS = 10_000;

/** Thrown by indexerFetch when GOVERNANCE_INDEXER_URL is unset. */
export class IndexerUnconfiguredError extends Error {
  constructor() {
    super("Governance indexer is not configured.");
    this.name = "IndexerUnconfiguredError";
  }
}

export function getIndexerUrl(): string | null {
  // eslint-disable-next-line no-process-env
  const value = process.env.GOVERNANCE_INDEXER_URL?.trim();
  return value ? value.replace(/\/+$/, "") : null;
}

type IndexerFetchInit = RequestInit & {
  /** Inbound request cookie to forward (carries the SIWE session). */
  cookie?: string | null;
  /** Abort after this many ms (default 10s). */
  timeoutMs?: number;
};

/**
 * Fetch a path on the indexer with the shared boilerplate: base-URL resolution
 * (throws IndexerUnconfiguredError if unset), `accept: json`, optional cookie
 * forwarding, and an abort timeout. Returns the raw upstream `Response`; callers
 * decide how to map status codes (or use `indexerErrorResponse` for the common
 * "just relay the indexer" 503/502 mapping).
 */
export async function indexerFetch(
  path: string,
  init: IndexerFetchInit = {}
): Promise<Response> {
  const base = getIndexerUrl();
  if (!base) throw new IndexerUnconfiguredError();

  const { cookie, timeoutMs = DEFAULT_TIMEOUT_MS, headers, ...rest } = init;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(`${base}${path}`, {
      ...rest,
      signal: controller.signal,
      headers: {
        accept: "application/json",
        ...(cookie ? { cookie } : {}),
        ...headers,
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Standard error → Response for routes that just relay the indexer:
 * unconfigured → 503, anything else (network/timeout) → 502.
 */
export function indexerErrorResponse(error: unknown): Response {
  if (error instanceof IndexerUnconfiguredError) {
    return Response.json({ error: error.message }, { status: 503 });
  }
  return Response.json({ error: "Indexer upstream error." }, { status: 502 });
}
