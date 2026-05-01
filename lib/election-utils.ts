import type { ElectionPhase } from "@/types/election";
import type { SerializableNomineeDetails } from "@gzeoneth/gov-tracker";

import {
  getCachedAddressDisplayRecord,
  getTallyDataClient,
  useAddressDisplayRecord,
  useAddressDisplayRecords,
} from "./tally-data/client";
import type {
  TallyAddressDisplayRecord,
  TallyCandidateSummary,
  TallyElectionCandidate,
} from "./tally-data/types";

export async function getCandidate(
  address: string
): Promise<TallyElectionCandidate | null> {
  return getTallyDataClient().getCandidate(address);
}

export async function getCandidateSummaries(
  addresses: string[]
): Promise<Map<string, TallyCandidateSummary>> {
  return getTallyDataClient().getCandidateSummaries(addresses);
}

export function getCandidateName(address: string): string | undefined {
  const record = getCachedAddressDisplayRecord(address);
  return record?.source === "candidate"
    ? (record.label ?? undefined)
    : undefined;
}

export function getCandidateTitle(address: string): string | undefined {
  const record = getCachedAddressDisplayRecord(address);
  return record?.source === "candidate"
    ? (record.title ?? undefined)
    : undefined;
}

export function getCandidateProfileUrl(address: string): string | undefined {
  const record = getCachedAddressDisplayRecord(address);
  return record?.source === "candidate"
    ? (record.profileUrl ?? undefined)
    : undefined;
}

export { useAddressDisplayRecord, useAddressDisplayRecords };
export type {
  TallyAddressDisplayRecord,
  TallyCandidateSummary,
  TallyElectionCandidate,
};

export function hasNoVotingPower(
  totalVotingPower: bigint | undefined
): boolean {
  return totalVotingPower !== undefined && totalVotingPower === BigInt(0);
}

export function hasExhaustedVotes(
  availableVotes: bigint | undefined,
  usedVotes: bigint | undefined
): boolean {
  return (
    availableVotes !== undefined &&
    availableVotes === BigInt(0) &&
    usedVotes !== undefined &&
    usedVotes > BigInt(0)
  );
}

export function hasReachedQuorum(
  votesReceived: string,
  quorumThreshold: string
): boolean {
  const threshold = BigInt(quorumThreshold);
  return threshold > BigInt(0) && BigInt(votesReceived) >= threshold;
}

export function countQualifiedNominees(
  nominees: ReadonlyArray<{ votesReceived: string; isExcluded: boolean }>,
  quorumThreshold: string
): number {
  return nominees.filter(
    (n) => !n.isExcluded && hasReachedQuorum(n.votesReceived, quorumThreshold)
  ).length;
}

export function shouldShowNomineeShortfall(
  compliantNomineeCount: number,
  targetNomineeCount: number
): boolean {
  return compliantNomineeCount < targetNomineeCount;
}

export function getContenderDescription(
  contenderCount: number,
  qualifiedCount: number,
  phase: ElectionPhase
): string {
  const suffix = contenderCount !== 1 ? "s" : "";
  if (phase !== "NOMINEE_SELECTION" || qualifiedCount === 0) {
    return `${contenderCount} contender${suffix} registered`;
  }
  return `${contenderCount} contender${suffix} registered, ${qualifiedCount} qualified as nominees`;
}

export function getAddressKey(
  details: SerializableNomineeDetails | null
): string {
  if (!details) return "";
  const addresses = new Set([
    ...details.contenders.map((c) => c.address.toLowerCase()),
    ...details.compliantNominees.map((n) => n.address.toLowerCase()),
    ...details.excludedNominees.map((n) => n.address.toLowerCase()),
  ]);
  return [...addresses].sort().join(",");
}
