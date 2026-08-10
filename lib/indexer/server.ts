// Server-side access to the governance indexer. `GOVERNANCE_INDEXER_URL` is a
// server-only env var (no NEXT_PUBLIC_ prefix); the browser always talks to the
// same-origin routes under app/api, never the indexer directly. Imported only
// by route handlers (themselves server-only).

const DEFAULT_TIMEOUT_MS = 10_000;

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
 * Fetch a path on the indexer with the shared boilerplate: `accept: json`,
 * optional cookie forwarding, and an abort timeout. `base` comes from
 * `getIndexerUrl()` (guard for null at the call site so the route can return
 * its own 503). Returns the raw upstream `Response`; callers decide how to map
 * status codes.
 */
export async function indexerFetch(
  base: string,
  path: string,
  init: IndexerFetchInit = {}
): Promise<Response> {
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
