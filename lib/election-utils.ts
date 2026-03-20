import type { ElectionPhase } from "@/types/election";

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
