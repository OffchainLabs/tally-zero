/**
 * Proposal type definitions for Arbitrum governance
 *
 * Defines types for raw and parsed proposals from Governor contracts.
 */

import type { ProposalStage, TimelockLink } from "@/types/proposal-stage";
import type { Address } from "@/types/search";

/** Finalized proposal states (won't change) */
export type FinalizedState =
  | "Canceled"
  | "Defeated"
  | "Succeeded"
  | "Queued"
  | "Expired"
  | "Executed";

/** Pending proposal states (may change) */
export type PendingState = "Pending" | "Active" | "Unknown";

/** All possible proposal state names */
export type ProposalStateName = FinalizedState | PendingState;

/** Raw proposal data from Governor contract */
export type Proposal = {
  /** Unique proposal ID */
  id: string;
  /** Governor contract address */
  contractAddress: Address;
  /** Address that created the proposal */
  proposer: string;
  /** Target contract addresses */
  targets: string[];
  /** ETH values for each call */
  values: ethers.BigNumber[];
  /** Function signatures (may be empty) */
  signatures: string[];
  /** Encoded calldata for each call */
  calldatas: string[];
  /** Block number when voting starts */
  startBlock: ethers.BigNumber;
  /** Block number when voting ends */
  endBlock: ethers.BigNumber;
  /** Proposal description/title */
  description: string;
  /** Numeric state from Governor contract (0-7) */
  state: number;
  /** Transaction hash that created the proposal */
  creationTxHash?: string;
};

/** Vote counts for a proposal */
export type ProposalVotes = {
  /** Votes against the proposal (in ARB wei) */
  againstVotes: string;
  /** Votes for the proposal (in ARB wei) */
  forVotes: string;
  /** Abstain votes (in ARB wei) */
  abstainVotes: string;
  /** Quorum requirement (in ARB wei) */
  quorum: string | undefined;
};

/** Parsed proposal with stringified values for display */
export type ParsedProposal = {
  /** Unique proposal ID */
  id: string;
  /** Governor contract address */
  contractAddress: Address;
  /** Address that created the proposal */
  proposer: string;
  /** Target contract addresses */
  targets: string[];
  /** ETH values for each call (stringified) */
  values: string[];
  /** Function signatures (may be empty) */
  signatures: string[];
  /** Encoded calldata for each call */
  calldatas: string[];
  /** Block number when voting starts (stringified) */
  startBlock: string;
  /** Block number when voting ends (stringified) */
  endBlock: string;
  /** Proposal description/title */
  description: string;
  /** Network chain ID */
  networkId: string;
  /** Current proposal state */
  state: ProposalStateName;
  /** Vote counts if available */
  votes?: ProposalVotes;
  /** Display name of the governor */
  governorName?: string;
  /** Transaction hash that created the proposal */
  creationTxHash?: string;
  /** Lifecycle stages if tracked */
  stages?: ProposalStage[];
  /** ISO timestamp when stages were last tracked */
  stagesTrackedAt?: string;
  /** Link to timelock cache for post-queue stages */
  timelockLink?: TimelockLink;
};

/** Return type for useTotalProposals hook */
export type UseTotalProposalsReturn = {
  /** Total number of proposals, or null if not loaded */
  totalProposals: number | null;
  /** Whether the count is being loaded */
  isLoadingTotal: boolean;
  /** Error if loading failed */
  error: Error | null;
};
