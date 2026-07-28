import {
  DELEGATE_MIN_VOTING_POWER_ARB,
  DELEGATE_MIN_VOTING_POWER_WEI,
  EXCLUDED_DELEGATE_ADDRESSES,
} from "@/config/delegates";
import type { TallyDelegateCountResult } from "@/lib/tally-data/types";

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
 * The indexer's dedicated /delegate-count endpoint applies the same threshold
 * and the governance exclude list server-side (via SQL COUNT), so this route
 * just relays that number — no whole-list read.
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
    exclude: EXCLUDED_DELEGATE_ADDRESSES.join(","),
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const upstream = await fetch(
      `${indexerUrl}/api/tally/delegate-count?${search}`,
      {
        signal: controller.signal,
        headers: { accept: "application/json" },
      }
    );
    if (!upstream.ok) {
      throw new Error(`Indexer request failed: ${upstream.status}`);
    }

    const { totalCount } = (await upstream.json()) as TallyDelegateCountResult;

    const headers = new Headers();
    headers.set("content-type", "application/json");
    // The population moves slowly (delegations, not votes), so cache it hard and
    // refresh in the background.
    headers.set(
      "cache-control",
      "public, s-maxage=300, stale-while-revalidate=3600"
    );

    return new Response(
      JSON.stringify({
        count: totalCount,
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
