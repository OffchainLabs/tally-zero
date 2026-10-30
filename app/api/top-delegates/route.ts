import { indexerErrorResponse } from "@/lib/indexer/server";
import {
  TOP_DELEGATES_REVALIDATE_SECONDS,
  TOP_DELEGATES_STALE_SECONDS,
} from "@/lib/top-delegates";
import { getCachedTopDelegates } from "@/lib/top-delegates/server";

/**
 * The top delegate candidates for the "didn't vote" badges, served from the
 * last successful indexer read.
 *
 * The browser asks the indexer directly first (through the proxy route) and
 * only falls back here when that fails, so what matters about this route is
 * what it does during an outage: `unstable_cache` plus the in-process copy in
 * `getCachedTopDelegates` keep handing out the last list that was read, and the
 * long `stale-while-revalidate` lets the CDN do the same without re-entering
 * the function.
 */
export async function GET(): Promise<Response> {
  try {
    const snapshot = await getCachedTopDelegates();

    const headers = new Headers();
    headers.set("content-type", "application/json");
    headers.set(
      "cache-control",
      `public, s-maxage=${TOP_DELEGATES_REVALIDATE_SECONDS}, stale-while-revalidate=${TOP_DELEGATES_STALE_SECONDS}`
    );

    return new Response(JSON.stringify(snapshot), { status: 200, headers });
  } catch (error) {
    return indexerErrorResponse(error);
  }
}
