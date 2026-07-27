/**
 * Delegate eligibility — the single rule behind every delegate count in the app.
 *
 * A delegated address only counts as a delegate once it holds at least
 * {@link DELEGATE_MIN_VOTING_POWER_ARB} of voting power. The indexer tracks
 * every address that has ever been delegated to (hundreds of thousands, most
 * holding dust), so an unfiltered count says nothing useful about who can
 * actually move a vote.
 *
 * Keep this module dependency-free: it is imported by client components and by
 * server route handlers alike.
 */

/** Minimum voting power, in whole ARB, for an address to count as a delegate. */
export const DELEGATE_MIN_VOTING_POWER_ARB = 5000;

/**
 * {@link DELEGATE_MIN_VOTING_POWER_ARB} in wei (ARB has 18 decimals).
 * `config/delegates.test.ts` asserts the two stay in step.
 */
export const DELEGATE_MIN_VOTING_POWER_WEI = "5000000000000000000000";

/**
 * Explicit row cap for delegate-list requests.
 *
 * The indexer defaults to 1,000 rows and truncates silently. Roughly 775
 * addresses currently clear the threshold, so the default would hold for now
 * and then start under-counting without warning as the DAO grows.
 */
export const DELEGATE_LIST_MAX_ROWS = 100_000;

/**
 * Governance exclude address. Voting power delegated here is deliberately left
 * out of quorum, so it is not a delegate and must not be counted as one.
 *
 * Duplicated from `EXCLUDED_DELEGATE_ADDRESSES` in `@gzeoneth/gov-tracker` so
 * that server route handlers can filter without pulling the SDK's node
 * dependencies into their bundle. `config/delegates.test.ts` asserts the two
 * lists match.
 */
export const EXCLUDED_DELEGATE_ADDRESSES = [
  "0x00000000000000000000000000000000000A4B86",
] as const;

const EXCLUDED_DELEGATE_ADDRESS_SET = new Set<string>(
  EXCLUDED_DELEGATE_ADDRESSES.map((address) => address.toLowerCase())
);

export function isExcludedDelegateAddress(address: string): boolean {
  return EXCLUDED_DELEGATE_ADDRESS_SET.has(address.toLowerCase());
}

/**
 * Count the delegates in `delegates` that meet the eligibility rule.
 *
 * Applies the threshold itself rather than trusting the caller's filter, so a
 * count is correct whether the list came from the indexer pre-filtered or from
 * on-chain refreshes that may have pushed an address below the threshold.
 */
export function countEligibleDelegates(
  delegates: ReadonlyArray<{ address: string; votingPower: string }>
): number {
  const threshold = BigInt(DELEGATE_MIN_VOTING_POWER_WEI);

  return delegates.filter(
    (delegate) =>
      !isExcludedDelegateAddress(delegate.address) &&
      BigInt(delegate.votingPower) >= threshold
  ).length;
}
