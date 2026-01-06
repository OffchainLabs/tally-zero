/**
 * Stage caching utilities for proposal lifecycle tracking
 * Provides localStorage-based caching with TTL and completion detection
 */

import { getFinalStageForGovernor } from "@/config/governors";
import {
  CACHE_VERSION,
  DEFAULT_CACHE_TTL_MS,
  STORAGE_KEYS,
} from "@/config/storage-keys";
import type { TimelockTrackingResult } from "@/hooks/use-timelock-operation";
import type {
  ProposalStage,
  ProposalTrackingResult,
  TimelockLink,
} from "@/types/proposal-stage";
import { MS_PER_DAY } from "./date-utils";
import { debug, isBrowser } from "./debug";
import { seedTimelockFromCache } from "./unified-cache";

/** Maximum age for tracking (60 days after proposal creation) */
export const MAX_TRACKING_AGE_MS = 60 * MS_PER_DAY;

export interface CachedStagesResult {
  version: number;
  timestamp: number;
  result: ProposalTrackingResult;
}

export interface CacheLoadResult {
  result: ProposalTrackingResult | null;
  isExpired: boolean;
  isComplete: boolean;
}

/**
 * Generate localStorage cache key for proposal stages
 *
 * @param proposalId - The proposal ID
 * @param governorAddress - The governor contract address
 * @returns The cache key string
 */
export function getCacheKey(
  proposalId: string,
  governorAddress: string
): string {
  return `${STORAGE_KEYS.STAGES_CACHE_PREFIX}${governorAddress.toLowerCase()}-${proposalId}`;
}

/** Proposal completion status */
export type CompletionStatus =
  | "pending"
  | "completed"
  | "failed"
  | "incomplete";

/**
 * Get completion status for a proposal based on its stages
 *
 * @param stages - Array of proposal stages
 * @param governorAddress - The governor contract address
 * @returns The completion status
 */
export function getCompletionStatus(
  stages: ProposalStage[],
  governorAddress: string
): CompletionStatus {
  if (!stages || stages.length === 0) return "pending";

  const lastStage = stages[stages.length - 1];

  // Failed proposals are complete (defeated, canceled, expired)
  if (lastStage.status === "FAILED") {
    return "failed";
  }

  // Check if we've reached the expected final stage for this governor
  const expectedFinalStage = getFinalStageForGovernor(governorAddress);

  if (!expectedFinalStage) {
    // Unknown governor - fall back to basic completion check
    return lastStage.status === "COMPLETED" ? "completed" : "incomplete";
  }

  // Check if the expected final stage exists and is COMPLETED
  const finalStage = stages.find((s) => s.type === expectedFinalStage);
  if (finalStage?.status === "COMPLETED") {
    return "completed";
  }

  return "incomplete";
}

/**
 * Check if stages are complete (have reached a terminal state)
 *
 * Terminal states:
 * - COMPLETED: Proposal successfully executed through all stages
 * - FAILED: Proposal was defeated, canceled, or expired during voting
 *
 * @deprecated Use getCompletionStatus() for more precise status
 * @param stages - Array of proposal stages
 * @returns True if the last stage is in a terminal state
 */
export function areStagesComplete(stages: ProposalStage[]): boolean {
  if (!stages || stages.length === 0) return false;
  const lastStage = stages[stages.length - 1];
  return lastStage.status === "COMPLETED" || lastStage.status === "FAILED";
}

/**
 * Check if stages have reached the final stage for a specific governor
 *
 * @deprecated Use getCompletionStatus() for more precise status
 * @param stages - Array of proposal stages
 * @param governorAddress - The governor contract address
 * @returns True if the proposal has reached its final stage
 */
export function hasReachedFinalStage(
  stages: ProposalStage[],
  governorAddress: string
): boolean {
  const status = getCompletionStatus(stages, governorAddress);
  return status === "completed" || status === "failed";
}

/**
 * Check if a proposal's tracking has exceeded the maximum age
 *
 * This prevents old proposals without retryables from being re-tracked forever.
 * Once a proposal has been tracked for 60 days past creation, we stop updating.
 *
 * @param stagesTrackedAt - ISO timestamp of when stages were last tracked
 * @param proposalCreatedAt - ISO timestamp or block-based estimate of creation
 * @returns True if tracking should be skipped due to age
 */
export function hasExceededTrackingAge(
  stagesTrackedAt: string | undefined,
  proposalCreatedAt: Date | number
): boolean {
  if (!stagesTrackedAt) return false;

  const trackedTime = new Date(stagesTrackedAt).getTime();
  const createdTime =
    typeof proposalCreatedAt === "number"
      ? proposalCreatedAt
      : proposalCreatedAt.getTime();

  return trackedTime - createdTime > MAX_TRACKING_AGE_MS;
}

/**
 * Check if cached stages need refresh based on TTL
 *
 * @param stagesTrackedAt - ISO timestamp of when stages were last tracked
 * @param ttlMs - Time-to-live in milliseconds (default: DEFAULT_CACHE_TTL_MS)
 * @returns True if cache is expired and needs refresh
 */
export function isCacheExpired(
  stagesTrackedAt: string | undefined,
  ttlMs: number = DEFAULT_CACHE_TTL_MS
): boolean {
  if (!stagesTrackedAt) return true;

  const trackedTime = new Date(stagesTrackedAt).getTime();
  return Date.now() - trackedTime > ttlMs;
}

/**
 * Load cached stages from localStorage
 *
 * Uses hasReachedFinalStage to determine if the proposal is complete,
 * which accounts for governor-specific final stages:
 * - Core Governor: RETRYABLE_REDEEMED
 * - Treasury Governor: L2_TIMELOCK_EXECUTED
 *
 * @param proposalId - The proposal ID
 * @param governorAddress - The governor contract address
 * @param ttlMs - Cache TTL in milliseconds
 * @returns Cache load result with data, expiry, and completion status
 */
export function loadCachedStages(
  proposalId: string,
  governorAddress: string,
  ttlMs: number = DEFAULT_CACHE_TTL_MS
): CacheLoadResult {
  if (!isBrowser) {
    return { result: null, isExpired: false, isComplete: false };
  }

  try {
    const key = getCacheKey(proposalId, governorAddress);
    const cached = localStorage.getItem(key);

    if (!cached) {
      return { result: null, isExpired: false, isComplete: false };
    }

    const parsed: CachedStagesResult = JSON.parse(cached);

    if (parsed.version !== CACHE_VERSION) {
      return { result: null, isExpired: false, isComplete: false };
    }

    const isExpired = Date.now() - parsed.timestamp > ttlMs;
    // Use governor-aware completion check
    const isComplete = hasReachedFinalStage(
      parsed.result.stages,
      governorAddress
    );

    return {
      result: parsed.result,
      isExpired,
      isComplete,
    };
  } catch (err) {
    debug.cache("failed to load cached stages for %s: %O", proposalId, err);
    return { result: null, isExpired: false, isComplete: false };
  }
}

/**
 * Save stages to localStorage cache
 *
 * @param proposalId - The proposal ID
 * @param governorAddress - The governor contract address
 * @param result - The tracking result to cache
 */
export function saveCachedStages(
  proposalId: string,
  governorAddress: string,
  result: ProposalTrackingResult
): void {
  if (!isBrowser) return;

  try {
    const key = getCacheKey(proposalId, governorAddress);
    const cached: CachedStagesResult = {
      version: CACHE_VERSION,
      timestamp: Date.now(),
      result,
    };
    localStorage.setItem(key, JSON.stringify(cached));
  } catch (err) {
    debug.cache("failed to save stages for %s: %O", proposalId, err);
  }
}

/**
 * Clear cached stages from localStorage
 *
 * @param proposalId - The proposal ID
 * @param governorAddress - The governor contract address
 */
export function clearCachedStages(
  proposalId: string,
  governorAddress: string
): void {
  if (!isBrowser) return;

  try {
    const key = getCacheKey(proposalId, governorAddress);
    localStorage.removeItem(key);
  } catch (err) {
    debug.cache("failed to clear stages for %s: %O", proposalId, err);
  }
}

/**
 * Seed localStorage with stages from a preloaded proposal
 *
 * Used by proposal-cache.ts to populate localStorage from the static cache.
 * This function now handles the split caching architecture:
 * - Proposal cache: stages 1-3 + timelockLink
 * - Timelock cache: stages 4-10 (if timelockLink is present)
 *
 * Only seeds if the proposal has more stages than what's currently cached.
 *
 * @param proposal - The proposal with stages to seed
 * @returns True if stages were seeded, false if skipped
 */
export function seedStagesFromProposal(proposal: {
  id: string;
  contractAddress: string;
  creationTxHash?: string;
  stages?: ProposalStage[];
  state: string;
  stagesTrackedAt?: string;
  timelockLink?: TimelockLink;
}): boolean {
  if (!isBrowser) return false;
  if (!proposal.stages || proposal.stages.length === 0) return false;
  if (!proposal.creationTxHash) return false;

  const key = getCacheKey(proposal.id, proposal.contractAddress);
  let seeded = false;

  try {
    // Split stages: 1-3 go to proposal cache, 4-10 go to timelock cache
    const proposalStages = proposal.stages.filter((s) =>
      ["PROPOSAL_CREATED", "VOTING_ACTIVE", "PROPOSAL_QUEUED"].includes(s.type)
    );

    const timelockStages = proposal.stages.filter(
      (s) =>
        !["PROPOSAL_CREATED", "VOTING_ACTIVE", "PROPOSAL_QUEUED"].includes(
          s.type
        )
    );

    // Check if we already have cached stages with same or more data
    const existing = localStorage.getItem(key);
    if (existing) {
      const parsed: CachedStagesResult = JSON.parse(existing);
      if (parsed.version === CACHE_VERSION && parsed.result.stages) {
        // Compare the total stages (proposal + timelock stages)
        if (parsed.result.stages.length >= proposalStages.length) {
          // Still need to check if we should seed timelock cache
          if (!proposal.timelockLink || timelockStages.length === 0) {
            return false;
          }
        }
      }
    }

    // Seed proposal cache with stages 1-3 + timelockLink
    const cachedResult: CachedStagesResult = {
      version: CACHE_VERSION,
      timestamp: proposal.stagesTrackedAt
        ? new Date(proposal.stagesTrackedAt).getTime()
        : Date.now(),
      result: {
        proposalId: proposal.id,
        creationTxHash: proposal.creationTxHash,
        governorAddress: proposal.contractAddress,
        stages: proposalStages,
        currentState: proposal.state,
        timelockLink: proposal.timelockLink,
      },
    };

    localStorage.setItem(key, JSON.stringify(cachedResult));
    seeded = true;

    // If there's a timelockLink and timelock stages, seed the timelock cache
    if (proposal.timelockLink && timelockStages.length > 0) {
      const queueStage = proposal.stages.find(
        (s) => s.type === "PROPOSAL_QUEUED"
      );
      const timelockResult: TimelockTrackingResult = {
        operationInfo: {
          operationId: proposal.timelockLink.operationId,
          target: "",
          value: "0",
          data: "0x",
          predecessor:
            "0x0000000000000000000000000000000000000000000000000000000000000000",
          delay: "0",
          txHash: proposal.timelockLink.txHash,
          blockNumber: proposal.timelockLink.queueBlockNumber,
          timestamp: queueStage?.transactions[0]?.timestamp || 0,
          timelockAddress: proposal.timelockLink.timelockAddress,
        },
        stages: timelockStages,
      };

      seedTimelockFromCache(
        proposal.timelockLink.txHash,
        proposal.timelockLink.operationId,
        timelockResult,
        proposal.stagesTrackedAt
      );
    }

    return seeded;
  } catch (err) {
    debug.cache("failed to seed stages for %s: %O", proposal.id, err);
    return false;
  }
}

/**
 * Check if a proposal has preloaded stages in localStorage
 *
 * @param proposalId - The proposal ID
 * @param governorAddress - The governor contract address
 * @returns True if cached stages exist for this proposal
 */
export function hasPreloadedStages(
  proposalId: string,
  governorAddress: string
): boolean {
  if (!isBrowser) return false;

  const key = getCacheKey(proposalId, governorAddress);
  try {
    const cached = localStorage.getItem(key);
    if (!cached) return false;

    const parsed: CachedStagesResult = JSON.parse(cached);
    return (
      parsed.version === CACHE_VERSION &&
      parsed.result.stages &&
      parsed.result.stages.length > 0
    );
  } catch (err) {
    debug.cache("failed to check preloaded stages for %s: %O", proposalId, err);
    return false;
  }
}

/**
 * Get preloaded stages from localStorage
 *
 * @param proposalId - The proposal ID
 * @param governorAddress - The governor contract address
 * @returns The cached tracking result, or null if not found
 */
export function getPreloadedStages(
  proposalId: string,
  governorAddress: string
): ProposalTrackingResult | null {
  if (!isBrowser) return null;

  const key = getCacheKey(proposalId, governorAddress);
  try {
    const cached = localStorage.getItem(key);
    if (!cached) return null;

    const parsed: CachedStagesResult = JSON.parse(cached);
    if (parsed.version !== CACHE_VERSION) return null;

    return parsed.result;
  } catch (err) {
    debug.cache("failed to get preloaded stages for %s: %O", proposalId, err);
    return null;
  }
}

/**
 * Trim cached stages from a specific index onwards
 *
 * This removes all stages including and after the specified index,
 * allowing the tracker to re-track from that point.
 *
 * @param proposalId - The proposal ID
 * @param governorAddress - The governor contract address
 * @param fromIndex - Index to start trimming from (inclusive)
 * @returns True if stages were trimmed, false if nothing to trim
 */
export function trimCachedStagesFromIndex(
  proposalId: string,
  governorAddress: string,
  fromIndex: number
): boolean {
  if (!isBrowser) return false;

  try {
    const key = getCacheKey(proposalId, governorAddress);
    const cached = localStorage.getItem(key);
    if (!cached) return false;

    const parsed: CachedStagesResult = JSON.parse(cached);
    if (parsed.version !== CACHE_VERSION) return false;

    // Trim stages from the specified index
    const trimmedStages = parsed.result.stages.slice(0, fromIndex);

    // If no stages left, clear the cache entirely
    if (trimmedStages.length === 0) {
      clearCachedStages(proposalId, governorAddress);
      return true;
    }

    // Update the cached result with trimmed stages
    const updatedResult: ProposalTrackingResult = {
      ...parsed.result,
      stages: trimmedStages,
      // Clear timelockLink if we're trimming before PROPOSAL_QUEUED stage
      timelockLink: trimmedStages.some((s) => s.type === "PROPOSAL_QUEUED")
        ? parsed.result.timelockLink
        : undefined,
    };

    // Save back to localStorage
    const updatedCache: CachedStagesResult = {
      version: CACHE_VERSION,
      timestamp: Date.now(), // Update timestamp to mark as fresh
      result: updatedResult,
    };

    localStorage.setItem(key, JSON.stringify(updatedCache));
    debug.cache("trimmed stages from index %d for %s", fromIndex, proposalId);
    return true;
  } catch (err) {
    debug.cache("failed to trim stages for %s: %O", proposalId, err);
    return false;
  }
}
