import type { SerializableMemberDetails } from "@gzeoneth/gov-tracker";

export interface WeightInfo {
  pct: number;
  remaining: bigint;
  duration: bigint;
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

  const duration = endBlock - deadline;

  if (currentL1Block <= deadline)
    return { pct: 100, remaining: duration, duration };
  if (currentL1Block >= endBlock)
    return { pct: 0, remaining: BigInt(0), duration };

  const remaining = endBlock - currentL1Block;
  const pct = (Number(remaining) / Number(duration)) * 100;
  return { pct, remaining, duration };
}
