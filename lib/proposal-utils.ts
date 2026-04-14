import type { ParsedProposal } from "@/types/proposal";

function isPlaceholderDescription(
  description: string | undefined,
  proposalId: string
): boolean {
  if (!description) return true;
  return description.trim() === `Proposal ${proposalId}`;
}

function hasRichProposalMetadata(proposal: ParsedProposal | null): boolean {
  if (!proposal) return false;

  return (
    !isPlaceholderDescription(proposal.description, proposal.id) &&
    proposal.proposer !== "Unknown" &&
    proposal.targets.length > 0
  );
}

export function mergeProposalData(
  staticProposal: ParsedProposal | null,
  liveProposal: ParsedProposal | null
): ParsedProposal | null {
  if (!staticProposal) return liveProposal;
  if (!liveProposal) return staticProposal;

  const preferredMetadata = hasRichProposalMetadata(liveProposal)
    ? liveProposal
    : staticProposal;

  return {
    ...preferredMetadata,
    state: liveProposal.state,
    votes: liveProposal.votes ?? preferredMetadata.votes,
    contractAddress:
      liveProposal.contractAddress || preferredMetadata.contractAddress,
    governorName: liveProposal.governorName || preferredMetadata.governorName,
    networkId: liveProposal.networkId || preferredMetadata.networkId,
    startBlock: liveProposal.startBlock || preferredMetadata.startBlock,
    endBlock: liveProposal.endBlock || preferredMetadata.endBlock,
    creationTxHash:
      liveProposal.creationTxHash || preferredMetadata.creationTxHash,
    stages: preferredMetadata.stages,
    timelockLink: preferredMetadata.timelockLink,
  };
}
