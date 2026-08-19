import type { SerializableMemberDetails } from "@gzeoneth/gov-tracker";

/** Days of the member election that carry undecayed weight. */
export const FULL_WEIGHT_DAYS = 7;
/** Total member-election span in days. */
export const TOTAL_DAYS = 21;

/**
 * The same decay curve as `computeWeightInfo`, expressed over days instead of
 * L1 blocks, for plotting. Kept beside `computeWeightInfo` so the two cannot
 * drift out of sight of each other; `election-weight.test.ts` asserts they agree.
 */
export function getWeight(day: number): number {
  if (day <= FULL_WEIGHT_DAYS) return 100;
  if (day >= TOTAL_DAYS) return 0;
  return ((TOTAL_DAYS - day) / (TOTAL_DAYS - FULL_WEIGHT_DAYS)) * 100;
}

export interface WeightInfo {
  pct: number;
  remaining: bigint;
  duration: bigint;
  /** Approximate elapsed day (0-based) within the 21-day election period */
  elapsedDays: number;
}

/**
 * Compute the current vote weight during the member election.
 * Weight decays linearly from 100% at fullWeightDeadline to 0% at proposalDeadline.
 * Matches the on-chain `votesToWeight` formula:
 *   weight = votes * (endBlock - currentBlock) / (endBlock - fullWeightDeadline)
 *
 * Uses L1 block numbers (the Governor contract's clock on Arbitrum).
 */
export function computeWeightInfo(
  memberDetails: SerializableMemberDetails | null,
  currentL1Block: bigint | undefined
): WeightInfo | undefined {
  if (!memberDetails || currentL1Block === undefined) return undefined;

  const deadline = BigInt(memberDetails.fullWeightDeadline);
  const endBlock = BigInt(memberDetails.proposalDeadline);

  // Guard against missing/zero deadline data (e.g. from stale cache)
  if (deadline === BigInt(0) || endBlock === BigInt(0) || endBlock <= deadline)
    return undefined;

  // duration = decay period (day 7 to day 21) in L1 blocks
  const duration = endBlock - deadline;
  // Total election span: decay covers 14 of 21 days, so total = duration * 3/2
  const totalBlocks = (duration * BigInt(3)) / BigInt(2);
  const startBlock = endBlock - totalBlocks;
  const elapsed =
    currentL1Block > startBlock ? currentL1Block - startBlock : BigInt(0);
  // The Math.min is defensive only: on every path where the ratio could exceed
  // 1, the `currentL1Block >= endBlock` branch below has already returned 21.
  const elapsedDays = Math.min(
    21,
    (Number(elapsed) / Number(totalBlocks)) * 21
  );

  if (currentL1Block <= deadline)
    return { pct: 100, remaining: duration, duration, elapsedDays };
  if (currentL1Block >= endBlock)
    return { pct: 0, remaining: BigInt(0), duration, elapsedDays: 21 };

  const remaining = endBlock - currentL1Block;
  const pct = (Number(remaining) / Number(duration)) * 100;
  return { pct, remaining, duration, elapsedDays };
}
