import { keccak256, stringToBytes, type Hex } from "viem";

import { proposalSchema } from "@/config/schema";
import { isValidAddress } from "@/lib/address-utils";

type ProposalForCancellation = ReturnType<typeof proposalSchema.parse>;

export type CancelArgs = readonly [
  readonly `0x${string}`[],
  readonly bigint[],
  readonly `0x${string}`[],
  `0x${string}`,
];

export function buildCancelArgs(
  proposal: ProposalForCancellation
): CancelArgs | null {
  if (proposal.targets.length === 0) return null;
  if (proposal.targets.length !== proposal.values.length) return null;
  if (proposal.targets.length !== proposal.calldatas.length) return null;
  if (!proposal.targets.every(isValidAddress)) return null;
  if (!proposal.calldatas.every(isHexString)) return null;

  try {
    const targets = proposal.targets as readonly `0x${string}`[];
    const values = proposal.values.map((v) => BigInt(v));
    const calldatas = proposal.calldatas as readonly `0x${string}`[];
    const descriptionHash = keccak256(stringToBytes(proposal.description));
    return [targets, values, calldatas, descriptionHash] as const;
  } catch {
    return null;
  }
}

function isHexString(value: string): value is Hex {
  return /^0x[0-9a-fA-F]*$/.test(value);
}
