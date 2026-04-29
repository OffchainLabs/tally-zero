export function isActiveProposalState(proposalState: string): boolean {
  return proposalState.toLowerCase() === "active";
}

export function hasZeroVotingPower(votingPower: bigint | undefined): boolean {
  return votingPower === BigInt(0);
}

export function shouldShowVoteStats({
  isConnected,
}: {
  isConnected: boolean;
}): boolean {
  return isConnected;
}

export function shouldShowVoteActionSection({
  hasRecordedVote,
  votingPower,
}: {
  hasRecordedVote: boolean;
  votingPower: bigint | undefined;
}): boolean {
  return !hasRecordedVote && !hasZeroVotingPower(votingPower);
}

export function shouldRenderProposalVoteCard({
  isConnected,
}: {
  isConnected: boolean;
}): boolean {
  return isConnected;
}
