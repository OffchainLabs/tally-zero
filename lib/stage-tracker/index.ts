/**
 * Stage tracker utilities for TallyZero
 *
 * Thin convenience layer over @gzeoneth/gov-tracker for creating trackers
 * with default config and adding UI-specific metadata to tracking results.
 */

import {
  createTracker as createGovTracker,
  getAllStageMetadata as govGetAllStageMetadata,
  type CacheAdapter,
  type ChunkingConfig,
  type TrackerOptions,
  type TrackingResult,
} from "@gzeoneth/gov-tracker";

import {
  ARBITRUM_RPC_URL,
  DEFAULT_CHUNKING_CONFIG,
  ETHEREUM_RPC_URL,
} from "@/config/arbitrum-governance";
import type { ProposalTrackingResult } from "@/types/proposal-stage";

// Re-export getAllStageMetadata from gov-tracker
export const getAllStageMetadata = govGetAllStageMetadata;

/**
 * Create a proposal stage tracker with RPC URLs
 *
 * Helper that configures gov-tracker with default chunking config.
 * Gov-tracker now accepts RPC URLs directly.
 *
 * @param l2RpcUrl - Arbitrum One RPC URL (defaults to ARBITRUM_RPC_URL)
 * @param l1RpcUrl - Ethereum mainnet RPC URL (defaults to ETHEREUM_RPC_URL)
 * @param options - Additional tracker options (onProgress, chunkingConfig, cache, etc)
 * @returns A configured ProposalStageTracker instance from gov-tracker
 */
export function createProposalTracker(
  l2RpcUrl: string = ARBITRUM_RPC_URL,
  l1RpcUrl: string = ETHEREUM_RPC_URL,
  options?: Omit<Partial<TrackerOptions>, "chunkingConfig"> & {
    chunkingConfig?: Partial<ChunkingConfig>;
    cache?: CacheAdapter;
  }
) {
  const {
    chunkingConfig: userChunkingConfig,
    cache,
    ...restOptions
  } = options || {};

  const chunkingConfig: ChunkingConfig = {
    ...DEFAULT_CHUNKING_CONFIG,
    ...userChunkingConfig,
  };

  return createGovTracker({
    l2Provider: l2RpcUrl,
    l1Provider: l1RpcUrl,
    chunkingConfig,
    cache,
    ...restOptions,
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
