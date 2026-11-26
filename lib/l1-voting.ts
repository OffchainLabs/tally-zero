/**
 * L1 voting proposals: identification, and the execution progress the indexer
 * reports for them.
 *
 * These proposals live on the L1 voting governor on Ethereum. gov-tracker does
 * not trace them, so nothing in the Core/Treasury lifecycle applies; their
 * progress after the vote is the indexer's `executionPhase`.
 */

import { ARBITRUM_CHAIN_ID } from "@/config/arbitrum-governance";
import { isL1VotingChainId, l2ChainId } from "@/config/chains";
import {
  getL1VotingGovernor,
  isArbitrumGovernor,
  isL1VotingGovernor,
} from "@/config/governors";
import type { IndexerExecutionPhase } from "@/lib/tally-data/types";
import type { ParsedProposal } from "@/types/proposal";

type L1VotingProposalSource = Partial<
  Pick<ParsedProposal, "governorType" | "networkId">
> & { contractAddress?: string };

/**
 * Whether a proposal is on the L1 voting governor. The Core and Treasury
 * governors are known by address and are never L1, whatever a row says.
 * Otherwise trusts the indexer's governor kind first, then the chain, then
 * addresses registered from indexer entries, so it holds for rows built from
 * any of those.
 */
export function isL1VotingProposal(proposal: L1VotingProposalSource): boolean {
  if (proposal.contractAddress && isArbitrumGovernor(proposal.contractAddress))
    return false;
  if (proposal.governorType) return proposal.governorType === "L1_VOTING";
  if (isL1VotingChainId(proposal.networkId)) return true;
  return Boolean(
    proposal.contractAddress && isL1VotingGovernor(proposal.contractAddress)
  );
}

/**
 * The chain a governor lives on. The Core and Treasury governors are on
 * Arbitrum One, whatever chain a row claims, so a wrong indexer `chainId`
 * cannot point an L2 vote elsewhere. For any other governor the proposal's own
 * chain (`networkId`) wins when it is one this build can reach: Arbitrum One,
 * the L2 in use, or an L1 voting chain. Anything else counts as not given, and
 * the chain falls back to the one an L1 voting governor was registered with
 * from the indexer, which is only known once the proposal list has loaded, and
 * then to Arbitrum One.
 *
 * The proposal link and the vote reads and sends all take their chain from
 * here, so they cannot disagree on which chain a proposal is on.
 */
export function governorChainId(
  chainId: number | string | undefined,
  governorAddress: string | undefined
): number {
  if (governorAddress && isArbitrumGovernor(governorAddress)) {
    return ARBITRUM_CHAIN_ID;
  }
  const given = Number(chainId ?? NaN);
  if (
    given === ARBITRUM_CHAIN_ID ||
    given === l2ChainId() ||
    isL1VotingChainId(given)
  ) {
    return given;
  }
  return (
    (governorAddress && getL1VotingGovernor(governorAddress)?.chainId) ||
    ARBITRUM_CHAIN_ID
  );
}

/**
 * The chain a proposal's governor lives on: Ethereum (or the local L1) for an
 * L1 voting proposal, otherwise Arbitrum One. Reads and sends for the proposal
 * go here, whatever chain the wallet is on.
 */
export function proposalChainId(proposal: {
  networkId?: string;
  contractAddress?: string;
}): number {
  return governorChainId(proposal.networkId, proposal.contractAddress);
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
