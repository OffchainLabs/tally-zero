import type {
  TallyProposalIndexEntry,
  TallyProposalVoteSummary,
  TallyProposalVoteSummaryEntry,
} from "@/lib/tally-data/types";

export const dynamic = "force-dynamic";

const FETCH_TIMEOUT_MS = 10_000;

/**
 * Server-to-indexer fan-out width. The whole point of this route is to lift
 * the per-proposal vote-summary requests off the browser (capped at 6
 * connections per origin) onto the server, where we can go wider without
 * hammering the indexer.
 */
const UPSTREAM_CONCURRENCY = 16;

function getIndexerUrl(): string | null {
  // eslint-disable-next-line no-process-env
  const value = process.env.GOVERNANCE_INDEXER_URL?.trim();
  return value ? value.replace(/\/+$/, "") : null;
}

async function fetchUpstream<T>(url: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { accept: "application/json" },
    });
    if (!response.ok) {
      throw new Error(`Indexer request failed: ${response.status}`);
    }
    return (await response.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Aggregates the indexer's per-proposal vote summaries into one response so
 * the client fills all vote bars with a single request instead of N.
 */
export async function GET(): Promise<Response> {
  const indexerUrl = getIndexerUrl();
  if (!indexerUrl) {
    return Response.json(
      { error: "Governance indexer is not configured." },
      { status: 503 }
    );
  }

  try {
    const entries = await fetchUpstream<TallyProposalIndexEntry[]>(
      `${indexerUrl}/api/tally/proposals`
    );

    const summaries: TallyProposalVoteSummaryEntry[] = [];
    for (let i = 0; i < entries.length; i += UPSTREAM_CONCURRENCY) {
      const batch = entries.slice(i, i + UPSTREAM_CONCURRENCY);
      const results = await Promise.all(
        batch.map(async (entry) => {
          const governorAddress = entry.governorAddress.toLowerCase();
          const voteSummary = await fetchUpstream<TallyProposalVoteSummary>(
            `${indexerUrl}/api/tally/proposals/${encodeURIComponent(
              governorAddress
            )}/${encodeURIComponent(entry.proposalId)}/vote-summary`
          ).catch(() => null);

          return voteSummary
            ? { proposalId: entry.proposalId, governorAddress, voteSummary }
            : null;
        })
      );

      for (const result of results) {
        if (result) summaries.push(result);
      }
    }

    const headers = new Headers();
    headers.set("content-type", "application/json");
    // The upstream indexer serves summaries one at a time (~200ms each), so a
    // cold aggregate takes many seconds for ~90 proposals. Cache aggressively:
    // settled proposals never change, and active proposals get live tallies
    // from the client's RPC refresh regardless.
    headers.set(
      "cache-control",
      "public, s-maxage=300, stale-while-revalidate=3600"
    );

    return new Response(JSON.stringify(summaries), { status: 200, headers });
  } catch {
    return Response.json({ error: "Indexer upstream error." }, { status: 502 });
  }
}
