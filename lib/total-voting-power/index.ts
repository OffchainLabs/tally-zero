/**
 * The DAO's delegated voting power, read from the ARB token.
 *
 * Kept free of `server-only` imports so the pure parts are shared by the
 * server-side read, the API route, and their tests. The on-chain read itself
 * lives in `./server`.
 */

/**
 * How long a snapshot stays valid, in seconds.
 *
 * The figure is identical for every user and only moves when delegations move,
 * so it is computed once on the server per hour rather than per user per visit.
 */
export const TOTAL_VOTING_POWER_REVALIDATE_SECONDS = 3600;

/** Response shape of `GET /api/total-voting-power`. All values are wei strings. */
export interface TotalVotingPowerSnapshot {
  /** `getTotalDelegation()` minus every excluded address's `getVotes`. */
  totalVotingPower: string;
  /** The token's own running sum of every delegate's voting power. */
  totalDelegation: string;
  /** Voting power held by the governance exclude address(es), backed out above. */
  excludedVotingPower: string;
  /** Block the reads were taken at, so a stale snapshot is recognisable. */
  blockNumber: number;
}

/**
 * Back the governance exclude address out of the token's total delegation.
 *
 * Power delegated to `0x...0A4B86` is deliberately left out of quorum, and it is
 * the large majority of `getTotalDelegation()` (unclaimed airdrop and treasury
 * tokens), so leaving it in would overstate the DAO's delegated voting power by
 * more than an order of magnitude. Clamped at zero so an inconsistent read can
 * never produce a negative total.
 */
export function subtractExcludedVotingPower(
  totalDelegation: string,
  excludedPowers: readonly string[]
): string {
  const net = excludedPowers.reduce(
    (remaining, power) => remaining - BigInt(power),
    BigInt(totalDelegation)
  );
  return (net > BigInt(0) ? net : BigInt(0)).toString();
}
