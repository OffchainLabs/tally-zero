/**
 * Stage tracker utilities for TallyZero
 *
 * Thin convenience layer over @gzeoneth/gov-tracker for creating trackers
 * with RPC URLs and adding UI-specific metadata to tracking results.
 */

import {
  createTracker as createGovTracker,
  type TrackerOptions,
  type TrackingResult,
} from "@gzeoneth/gov-tracker";
import { ethers } from "ethers";

import {
  ARBITRUM_RPC_URL,
  ETHEREUM_RPC_URL,
} from "@/config/arbitrum-governance";
import type { ProposalTrackingResult } from "@/types/proposal-stage";

/**
 * Create a proposal stage tracker with RPC URLs
 *
 * Helper that creates ethers providers from RPC URLs and configures gov-tracker.
 * Use this when you have RPC URLs and need to create a tracker.
 *
 * @param l2RpcUrl - Arbitrum One RPC URL (defaults to ARBITRUM_RPC_URL)
 * @param l1RpcUrl - Ethereum mainnet RPC URL (defaults to ETHEREUM_RPC_URL)
 * @param options - Additional tracker options (onProgress, etc)
 * @returns A configured ProposalStageTracker instance from gov-tracker
 */
export function createProposalTracker(
  l2RpcUrl: string = ARBITRUM_RPC_URL,
  l1RpcUrl: string = ETHEREUM_RPC_URL,
  options?: Partial<TrackerOptions>
) {
  const l2Provider = new ethers.providers.JsonRpcProvider(l2RpcUrl);
  const l1Provider = new ethers.providers.JsonRpcProvider(l1RpcUrl);

  return createGovTracker({
    l2Provider,
    l1Provider,
    ...options,
  });
}

/**
 * Convert gov-tracker TrackingResult to ProposalTrackingResult
 *
 * Adds UI-specific metadata (proposalId, creationTxHash, governorAddress)
 * for session management and caching in TallyZero.
 *
 * @param result - Tracking result from gov-tracker
 * @param proposalId - The proposal ID
 * @param creationTxHash - The creation transaction hash
 * @param governorAddress - The governor contract address
 * @returns ProposalTrackingResult with UI metadata
 */
export function toProposalTrackingResult(
  result: TrackingResult,
  proposalId: string,
  creationTxHash: string,
  governorAddress: string
): ProposalTrackingResult {
  return {
    proposalId,
    creationTxHash,
    governorAddress,
    stages: result.stages,
    currentState: result.currentState,
    timelockLink: result.timelockLink,
    isComplete: result.isComplete,
    proposalType: result.proposalType,
  };
}
