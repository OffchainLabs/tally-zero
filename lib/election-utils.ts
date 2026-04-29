import candidatesData from "@/data/election-candidates.json";
import type { ElectionPhase } from "@/types/election";
import type { SerializableNomineeDetails } from "@gzeoneth/gov-tracker";

const candidateNames = new Map<string, string>();
const candidateTitles = new Map<string, string>();
for (const [addr, data] of Object.entries(
  candidatesData as Record<string, { name: string; title?: string }>
)) {
  candidateNames.set(addr.toLowerCase(), data.name);
  if (data.title) {
    candidateTitles.set(addr.toLowerCase(), data.title);
  }
}

export function getCandidateName(address: string): string | undefined {
  return candidateNames.get(address.toLowerCase());
}

export function getCandidateTitle(address: string): string | undefined {
  return candidateTitles.get(address.toLowerCase());
}

export function getCandidateProfileUrl(address: string): string | undefined {
  if (candidateNames.has(address.toLowerCase())) {
    return `/elections/contender/${address}`;
  }
  return undefined;
}

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
