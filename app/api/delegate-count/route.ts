import {
  DELEGATE_LIST_MAX_ROWS,
  DELEGATE_MIN_VOTING_POWER_ARB,
  DELEGATE_MIN_VOTING_POWER_WEI,
  countEligibleDelegates,
} from "@/config/delegates";
import type { TallyDelegateListResult } from "@/lib/tally-data/types";

export const dynamic = "force-dynamic";

const FETCH_TIMEOUT_MS = 15_000;

function getIndexerUrl(): string | null {
  // eslint-disable-next-line no-process-env
  const value = process.env.GOVERNANCE_INDEXER_URL?.trim();
  return value ? value.replace(/\/+$/, "") : null;
}

/**
 * Counts the delegates that clear the app-wide voting-power threshold.
 *
 * The indexer has no count endpoint, so the only way to get this number is to
 * read the whole eligible list (~250 KB today). This route does that read
 * server-side and hands the browser a single integer instead.
 */
export async function GET(): Promise<Response> {
  const indexerUrl = getIndexerUrl();
  if (!indexerUrl) {
    return Response.json(
      { error: "Governance indexer is not configured." },
      { status: 503 }
    );
  }

  const search = new URLSearchParams({
    minVotingPower: DELEGATE_MIN_VOTING_POWER_WEI,
    limit: String(DELEGATE_LIST_MAX_ROWS),
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const upstream = await fetch(
      `${indexerUrl}/api/tally/delegates?${search}`,
      {
        signal: controller.signal,
        headers: { accept: "application/json" },
      }
    );
    if (!upstream.ok) {
      throw new Error(`Indexer request failed: ${upstream.status}`);
    }

    const { delegates } = (await upstream.json()) as TallyDelegateListResult;

    const headers = new Headers();
    headers.set("content-type", "application/json");
    // The population moves slowly (delegations, not votes), and the upstream
    // read is heavy, so cache it hard and refresh in the background.
    headers.set(
      "cache-control",
      "public, s-maxage=300, stale-while-revalidate=3600"
    );

    return new Response(
      JSON.stringify({
        count: countEligibleDelegates(delegates ?? []),
        minVotingPowerArb: DELEGATE_MIN_VOTING_POWER_ARB,
        minVotingPower: DELEGATE_MIN_VOTING_POWER_WEI,
      }),
      { status: 200, headers }
    );
  } catch {
    return Response.json({ error: "Indexer upstream error." }, { status: 502 });
  } finally {
    clearTimeout(timer);
  }
}
