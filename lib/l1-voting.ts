/**
 * L1 voting proposals: identification, and the execution progress the indexer
 * reports for them.
 *
 * These proposals live on the L1 voting governor on Ethereum. gov-tracker does
 * not trace them, so nothing in the Core/Treasury lifecycle applies; their
 * progress after the vote is the indexer's `executionPhase`.
 */

import { isL1VotingChainId } from "@/config/chains";
import { isL1VotingGovernor } from "@/config/governors";
import type { IndexerExecutionPhase } from "@/lib/tally-data/types";
import type { ParsedProposal } from "@/types/proposal";

type L1VotingProposalSource = Partial<
  Pick<ParsedProposal, "governorType" | "networkId">
> & { contractAddress?: string };

/**
 * Whether a proposal is on the L1 voting governor. Trusts the indexer's
 * governor kind first, then the chain, then addresses registered from indexer
 * entries, so it holds for rows built from any of those.
 */
export function isL1VotingProposal(proposal: L1VotingProposalSource): boolean {
  if (proposal.governorType) return proposal.governorType === "L1_VOTING";
  if (isL1VotingChainId(proposal.networkId)) return true;
  return Boolean(
    proposal.contractAddress && isL1VotingGovernor(proposal.contractAddress)
  );
}

/** The execution phases an L1 voting proposal moves through, in order */
export const L1_EXECUTION_PHASES = [
  "L1_TIMELOCK_PENDING",
  "L1_TIMELOCK_EXECUTED",
  "L2_RETRYABLE_PENDING",
  "FULLY_EXECUTED",
] as const satisfies readonly IndexerExecutionPhase[];

export type L1ExecutionPhase = (typeof L1_EXECUTION_PHASES)[number];

export const L1_EXECUTION_PHASE_LABELS: Record<L1ExecutionPhase, string> = {
  L1_TIMELOCK_PENDING: "Queued in the L1 timelock",
  L1_TIMELOCK_EXECUTED: "L1 timelock executed",
  L2_RETRYABLE_PENDING: "Retryable ticket pending on Arbitrum",
  FULLY_EXECUTED: "Fully executed",
};

export type L1ExecutionStageStatus =
  | "completed"
  | "active"
  | "cancelled"
  | "upcoming";

export interface L1ExecutionStage {
  phase: L1ExecutionPhase;
  label: string;
  status: L1ExecutionStageStatus;
}

export function l1ExecutionPhaseIndex(
  phase: string | null | undefined
): number {
  return L1_EXECUTION_PHASES.indexOf(phase as L1ExecutionPhase);
}

/**
 * The phase list with each phase's status. Phases before the current one are
 * done; the current one is in progress while it is a `_PENDING` phase and done
 * otherwise, or cancelled when the indexer says an operation was cancelled.
 * With no phase (not queued yet, or one this governor never reaches) every
 * phase is upcoming.
 */
export function getL1ExecutionStages(
  executionPhase: string | null | undefined,
  executionCancelled = false
): L1ExecutionStage[] {
  const current = l1ExecutionPhaseIndex(executionPhase);

  return L1_EXECUTION_PHASES.map((phase, index) => {
    let status: L1ExecutionStageStatus;
    if (current === -1 || index > current) {
      status = "upcoming";
    } else if (index < current) {
      status = "completed";
    } else if (executionCancelled) {
      status = "cancelled";
    } else {
      status = phase.endsWith("_PENDING") ? "active" : "completed";
    }
    return { phase, label: L1_EXECUTION_PHASE_LABELS[phase], status };
  });
}
