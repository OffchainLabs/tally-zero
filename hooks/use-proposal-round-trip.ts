"use client";

import { useMemo } from "react";

import { isCoreGovernor } from "@/config/governors";
import { useProposalStages } from "@/hooks/use-proposal-stages";
import {
  roundTripFromStages,
  type RoundTripEvidence,
} from "@/lib/proposal-round-trip";
import { normalizeProposalStateName } from "@/lib/state-utils";

interface RoundTripProposal {
  id: string;
  contractAddress: string;
  state: string;
  creationTxHash?: string;
}

/**
 * Round-trip evidence for a proposal, or null when there is none.
 *
 * Only a Core proposal the governor already calls `Executed` has a round-trip
 * left to wait on, so nothing else starts tracking. The Lifecycle tab mounts
 * lazily, so the badge needs its own request; `trackerManager` keys sessions by
 * proposal and governor, so the two share one crawl rather than duplicating it.
 */
export function useProposalRoundTrip(
  proposal: RoundTripProposal
): RoundTripEvidence | null {
  const enabled =
    normalizeProposalStateName(proposal.state) === "Executed" &&
    isCoreGovernor(proposal.contractAddress) &&
    Boolean(proposal.creationTxHash);

  const { stages } = useProposalStages({
    proposalId: proposal.id,
    creationTxHash: proposal.creationTxHash ?? "",
    governorAddress: proposal.contractAddress,
    enabled,
  });

  return useMemo(
    () =>
      enabled ? roundTripFromStages(stages, proposal.contractAddress) : null,
    [enabled, stages, proposal.contractAddress]
  );
}
