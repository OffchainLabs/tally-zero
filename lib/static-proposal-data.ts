import {
  extractProposals,
  getStageData,
  getVotingDataFromStages,
  type BundledCache,
} from "@gzeoneth/gov-tracker";

import {
  ARBITRUM_CHAIN_ID,
  ARBITRUM_GOVERNORS,
} from "@/config/arbitrum-governance";
import { findByAddress } from "@/lib/address-utils";
import type { ParsedProposal, ProposalStateName } from "@/types/proposal";

const VALID_PROPOSAL_STATES: ProposalStateName[] = [
  "Pending",
  "Active",
  "Canceled",
  "Defeated",
  "Succeeded",
  "Queued",
  "Expired",
  "Executed",
] as const;

function normalizeProposalState(
  state: string | null | undefined
): ProposalStateName {
  const normalized = state?.toLowerCase();
  const match = VALID_PROPOSAL_STATES.find(
    (value) => value.toLowerCase() === normalized
  );

  return match ?? "Pending";
}

export function getStaticProposalById(
  proposalId: string
): ParsedProposal | null {
  try {
    const cache =
      require("@gzeoneth/gov-tracker/bundled-cache.json") as BundledCache;

    const proposal = extractProposals(cache).find(
      (item) => item.proposalId === proposalId
    );

    if (!proposal) {
      return null;
    }

    const governor = findByAddress(
      ARBITRUM_GOVERNORS,
      proposal.governorAddress
    );
    const createdStage = proposal.stages.find(
      (s) => s.type === "PROPOSAL_CREATED"
    );
    const createdData = createdStage
      ? getStageData(createdStage, "PROPOSAL_CREATED")
      : null;
    const voteData = getVotingDataFromStages(proposal.stages);

    return {
      id: proposal.proposalId,
      contractAddress: proposal.governorAddress as `0x${string}`,
      proposer: createdData?.proposer ?? "",
      targets: createdData?.targets ?? [],
      values: createdData?.values ?? [],
      signatures: createdData?.signatures ?? [],
      calldatas: createdData?.calldatas ?? [],
      startBlock: createdData?.startBlock ?? "0",
      endBlock: createdData?.endBlock ?? "0",
      description: createdData?.description ?? "",
      networkId: String(ARBITRUM_CHAIN_ID),
      state: normalizeProposalState(proposal.currentState),
      governorName: governor?.name ?? "Unknown",
      creationTxHash: proposal.creationTxHash ?? "",
      timelockLink: proposal.timelockLink,
      stages: proposal.stages,
      votes: voteData
        ? {
            forVotes: voteData.forVotesRaw ?? "0",
            againstVotes: voteData.againstVotesRaw ?? "0",
            abstainVotes: voteData.abstainVotesRaw ?? "0",
            quorum: voteData.quorumRaw ?? undefined,
          }
        : undefined,
    };
  } catch {
    return null;
  }
}
