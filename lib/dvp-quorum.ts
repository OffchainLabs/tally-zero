import type { GovernorType } from "@/config/governors";

export const DVP_QUORUM_ACTIVATION_PROPOSAL_ID =
  "112177996398925212273579485756315626637025938627124330171390356044681347897430";
export const DVP_QUORUM_ACTIVATION_BLOCK = BigInt("24770077");

const ARB_WEI = BigInt("1000000000000000000");
const arbToWei = (arb: string) => BigInt(arb) * ARB_WEI;

export type DvpQuorumParameters = {
  numerator: bigint;
  denominator: bigint;
  baseline: bigint;
  max: bigint;
};

export const DVP_QUORUM_PARAMETERS = {
  core: {
    numerator: BigInt(1),
    denominator: BigInt(2),
    baseline: arbToWei("150000000"),
    max: arbToWei("450000000"),
  },
  treasury: {
    numerator: BigInt(2),
    denominator: BigInt(5),
    baseline: arbToWei("100000000"),
    max: arbToWei("300000000"),
  },
} satisfies Record<GovernorType, DvpQuorumParameters>;

export function calculateDvpQuorum(
  totalDelegation: string | null,
  governorType: GovernorType | undefined
): string | undefined {
  if (!totalDelegation || !governorType) return undefined;

  const params = DVP_QUORUM_PARAMETERS[governorType];

  try {
    const dvp = BigInt(totalDelegation);
    const preliminary = (dvp * params.numerator) / params.denominator;
    const bounded =
      preliminary < params.baseline ? params.baseline : preliminary;

    return (bounded > params.max ? params.max : bounded).toString();
  } catch {
    return undefined;
  }
}

export function isAfterDvpQuorumActivation(
  proposalId: string,
  startBlock: string
): boolean {
  if (proposalId === DVP_QUORUM_ACTIVATION_PROPOSAL_ID) return false;

  try {
    return BigInt(startBlock) > DVP_QUORUM_ACTIVATION_BLOCK;
  } catch {
    return false;
  }
}
