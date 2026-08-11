import { debug } from "@/lib/debug";
import { TOTAL_VOTING_POWER_REVALIDATE_SECONDS } from "@/lib/total-voting-power";
import { getCachedTotalVotingPower } from "@/lib/total-voting-power/server";

/**
 * The DAO's delegated voting power, read from the ARB token
 * (`getTotalDelegation()` minus the governance exclude address's `getVotes`).
 *
 * Every user sees the same number, so the read happens here rather than in each
 * browser: `unstable_cache` holds it for an hour server-side, and the
 * `s-maxage` below lets the CDN serve that same hour-old figure to everyone
 * without re-entering the function at all.
 */
export async function GET(): Promise<Response> {
  try {
    const snapshot = await getCachedTotalVotingPower();

    const headers = new Headers();
    headers.set("content-type", "application/json");
    headers.set(
      "cache-control",
      `public, s-maxage=${TOTAL_VOTING_POWER_REVALIDATE_SECONDS}, stale-while-revalidate=${TOTAL_VOTING_POWER_REVALIDATE_SECONDS}`
    );

    return new Response(JSON.stringify(snapshot), { status: 200, headers });
  } catch (err) {
    debug.app("total voting power route failed: %O", err);
    return Response.json(
      { error: "Failed to read total voting power on-chain." },
      { status: 502 }
    );
  }
}
