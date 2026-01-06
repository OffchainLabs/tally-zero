/**
 * Unified cache resolution for proposal lifecycle stages
 *
 * This module provides a unified view of proposal stages by combining:
 * - Proposal cache: stages 1-3 (PROPOSAL_CREATED, VOTING_ACTIVE, PROPOSAL_QUEUED)
 * - Timelock cache: stages 4-10 (L2_TIMELOCK through RETRYABLE_EXECUTED)
 *
 * When a proposal reaches PROPOSAL_QUEUED, a timelockLink is created that
 * references the timelock operation cache. This allows:
 * - No duplication of tracking logic
 * - Efficient cache invalidation (each cache has its own TTL)
 * - Consistent results between proposal and timelock trackers
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
import { debug, isBrowser } from "./debug";
import {
  getCacheKey,
  getCompletionStatus,
  trimCachedStagesFromIndex,
  type CachedStagesResult,
  type CompletionStatus,
} from "./stages-cache";

/**
 * Cached timelock operation result
 */
export interface CachedTimelockResult {
  version: number;
  timestamp: number;
  result: TimelockTrackingResult;
}

/**
 * Result of unified cache loading
 */
export interface UnifiedCacheResult {
  /** Combined stages from both caches */
  stages: ProposalStage[];
  /** Link to timelock cache (if present) */
  timelockLink?: TimelockLink;
  /** Whether proposal cache is expired */
  proposalCacheExpired: boolean;
  /** Whether timelock cache is expired */
  timelockCacheExpired: boolean;
  /** Completion status */
  completionStatus: CompletionStatus;
  /** Whether tracking is complete (no refresh needed) */
  isComplete: boolean;
  /** Original proposal tracking result (stages 1-3) */
  proposalResult: ProposalTrackingResult | null;
  /** Original timelock tracking result (stages 4-10) */
  timelockResult: TimelockTrackingResult | null;
}

/**
 * Get cache key for timelock operations
 *
 * @param txHash - The queue transaction hash
 * @param operationId - The timelock operation ID
 * @returns The cache key string
 */
export function getTimelockCacheKey(
  txHash: string,
  operationId: string
): string {
  return `${STORAGE_KEYS.TIMELOCK_OP_CACHE_PREFIX}${txHash.toLowerCase()}-${operationId.toLowerCase()}`;
}

/**
 * Load cached timelock result from localStorage
 *
 * @param txHash - The queue transaction hash
 * @param operationId - The timelock operation ID
 * @param ttlMs - Cache TTL in milliseconds
 * @returns Object with result and expiry status
 */
export function loadCachedTimelockResult(
  txHash: string,
  operationId: string,
  ttlMs: number = DEFAULT_CACHE_TTL_MS
): { result: TimelockTrackingResult | null; isExpired: boolean } {
  if (!isBrowser) {
    return { result: null, isExpired: false };
  }

  try {
    const key = getTimelockCacheKey(txHash, operationId);
    const cached = localStorage.getItem(key);
    if (!cached) {
      return { result: null, isExpired: false };
    }

    const parsed: CachedTimelockResult = JSON.parse(cached);
    if (parsed.version !== CACHE_VERSION) {
      return { result: null, isExpired: false };
    }

    const isExpired = Date.now() - parsed.timestamp > ttlMs;
    return { result: parsed.result, isExpired };
  } catch (err) {
    debug.cache("failed to load timelock cache for %s: %O", txHash, err);
    return { result: null, isExpired: false };
  }
}

/**
 * Save timelock result to localStorage cache
 *
 * @param txHash - The queue transaction hash
 * @param operationId - The timelock operation ID
 * @param result - The timelock tracking result to cache
 */
export function saveCachedTimelockResult(
  txHash: string,
  operationId: string,
  result: TimelockTrackingResult
): void {
  if (!isBrowser) return;

  try {
    const key = getTimelockCacheKey(txHash, operationId);
    const cached: CachedTimelockResult = {
      version: CACHE_VERSION,
      timestamp: Date.now(),
      result,
    };
    localStorage.setItem(key, JSON.stringify(cached));
  } catch (err) {
    debug.cache("failed to save timelock cache for %s: %O", txHash, err);
  }
}

/**
 * Clear timelock result from localStorage cache
 *
 * @param txHash - The queue transaction hash
 * @param operationId - The timelock operation ID
 */
export function clearCachedTimelockResult(
  txHash: string,
  operationId: string
): void {
  if (!isBrowser) return;

  try {
    const key = getTimelockCacheKey(txHash, operationId);
    localStorage.removeItem(key);
  } catch (err) {
    debug.cache("failed to clear timelock cache for %s: %O", txHash, err);
  }
}

/**
 * Load unified stages from both proposal and timelock caches
 *
 * This function provides a unified view by:
 * 1. Loading the proposal cache (stages 1-3 + timelockLink)
 * 2. If timelockLink exists, loading the timelock cache (stages 4-10)
 * 3. Merging the stages and returning combined result
 *
 * @param proposalId - The proposal ID
 * @param governorAddress - The governor contract address
 * @param ttlMs - Cache TTL in milliseconds
 * @returns Combined cache result with all stages
 */
export function loadUnifiedStages(
  proposalId: string,
  governorAddress: string,
  ttlMs: number = DEFAULT_CACHE_TTL_MS
): UnifiedCacheResult {
  if (!isBrowser) {
    return {
      stages: [],
      proposalCacheExpired: false,
      timelockCacheExpired: false,
      completionStatus: "pending",
      isComplete: false,
      proposalResult: null,
      timelockResult: null,
    };
  }

  // 1. Load proposal cache (stages 1-3)
  const proposalCacheKey = getCacheKey(proposalId, governorAddress);
  let proposalResult: ProposalTrackingResult | null = null;
  let proposalCacheExpired = false;

  try {
    const cachedProposal = localStorage.getItem(proposalCacheKey);
    if (cachedProposal) {
      const parsed: CachedStagesResult = JSON.parse(cachedProposal);
      if (parsed.version === CACHE_VERSION) {
        proposalResult = parsed.result;
        proposalCacheExpired = Date.now() - parsed.timestamp > ttlMs;
      }
    }
  } catch (err) {
    debug.cache("failed to load unified stages for %s: %O", proposalId, err);
  }

  // No proposal cache - return empty result
  if (!proposalResult) {
    return {
      stages: [],
      proposalCacheExpired: false,
      timelockCacheExpired: false,
      completionStatus: "pending",
      isComplete: false,
      proposalResult: null,
      timelockResult: null,
    };
  }

  // Check if proposal has a timelock link
  const timelockLink = proposalResult.timelockLink;

  // No timelock link - return proposal stages only
  if (!timelockLink) {
    const completionStatus = getCompletionStatus(
      proposalResult.stages,
      governorAddress
    );
    return {
      stages: proposalResult.stages,
      proposalCacheExpired,
      timelockCacheExpired: false,
      completionStatus,
      isComplete:
        completionStatus === "completed" || completionStatus === "failed",
      proposalResult,
      timelockResult: null,
    };
  }

  // 2. Load timelock cache (stages 4-10)
  const { result: timelockResult, isExpired: timelockCacheExpired } =
    loadCachedTimelockResult(
      timelockLink.txHash,
      timelockLink.operationId,
      ttlMs
    );

  // 3. Merge stages
  // Take stages 1-3 from proposal cache
  const proposalStages = proposalResult.stages.filter((s) =>
    ["PROPOSAL_CREATED", "VOTING_ACTIVE", "PROPOSAL_QUEUED"].includes(s.type)
  );

  // Take stages 4-10 from timelock cache (if available)
  const timelockStages = timelockResult?.stages ?? [];

  const mergedStages = [...proposalStages, ...timelockStages];

  // Determine completion status from merged stages
  const completionStatus = getCompletionStatus(mergedStages, governorAddress);
  const isComplete =
    completionStatus === "completed" || completionStatus === "failed";

  return {
    stages: mergedStages,
    timelockLink,
    proposalCacheExpired,
    timelockCacheExpired,
    completionStatus,
    isComplete,
    proposalResult,
    timelockResult,
  };
}

/**
 * Check if unified cache needs refresh
 *
 * @param unifiedResult - Result from loadUnifiedStages
 * @returns true if any cache is expired and not complete
 */
export function needsRefresh(unifiedResult: UnifiedCacheResult): boolean {
  if (unifiedResult.isComplete) {
    return false;
  }
  return (
    unifiedResult.proposalCacheExpired || unifiedResult.timelockCacheExpired
  );
}

/**
 * Determine which cache(s) need refresh
 *
 * @param unifiedResult - Result from loadUnifiedStages
 * @returns Object indicating which refreshes are needed
 */
export function getRefreshNeeds(unifiedResult: UnifiedCacheResult): {
  needsProposalRefresh: boolean;
  needsTimelockRefresh: boolean;
} {
  if (unifiedResult.isComplete) {
    return { needsProposalRefresh: false, needsTimelockRefresh: false };
  }

  // If no timelock link yet, only proposal cache matters
  if (!unifiedResult.timelockLink) {
    return {
      needsProposalRefresh:
        unifiedResult.proposalCacheExpired || unifiedResult.stages.length === 0,
      needsTimelockRefresh: false,
    };
  }

  return {
    needsProposalRefresh: unifiedResult.proposalCacheExpired,
    needsTimelockRefresh:
      unifiedResult.timelockCacheExpired || !unifiedResult.timelockResult,
  };
}

/**
 * Seed timelock cache from prebuilt cache data
 *
 * Used during app initialization to populate localStorage from
 * the prebuilt timelock operations cache.
 *
 * @param txHash - The queue transaction hash
 * @param operationId - The timelock operation ID
 * @param result - The timelock tracking result to seed
 * @param trackedAt - Optional ISO timestamp of when stages were tracked
 * @returns True if seeded, false if skipped
 */
export function seedTimelockFromCache(
  txHash: string,
  operationId: string,
  result: TimelockTrackingResult,
  trackedAt?: string
): boolean {
  if (!isBrowser) return false;

  const key = getTimelockCacheKey(txHash, operationId);

  try {
    // Check if we already have cached data with same or more stages
    const existing = localStorage.getItem(key);
    if (existing) {
      const parsed: CachedTimelockResult = JSON.parse(existing);
      if (
        parsed.version === CACHE_VERSION &&
        parsed.result.stages.length >= result.stages.length
      ) {
        return false;
      }
    }

    const cached: CachedTimelockResult = {
      version: CACHE_VERSION,
      timestamp: trackedAt ? new Date(trackedAt).getTime() : Date.now(),
      result,
    };

    localStorage.setItem(key, JSON.stringify(cached));
    return true;
  } catch (err) {
    debug.cache("failed to seed timelock cache for %s: %O", txHash, err);
    return false;
  }
}

/**
 * Check if timelock cache exists and is valid
 *
 * @param txHash - The queue transaction hash
 * @param operationId - The timelock operation ID
 * @returns True if valid cached data exists
 */
export function hasTimelockCache(txHash: string, operationId: string): boolean {
  if (!isBrowser) return false;

  try {
    const key = getTimelockCacheKey(txHash, operationId);
    const cached = localStorage.getItem(key);
    if (!cached) return false;

    const parsed: CachedTimelockResult = JSON.parse(cached);
    return parsed.version === CACHE_VERSION && parsed.result.stages.length > 0;
  } catch (err) {
    debug.cache("failed to check timelock cache for %s: %O", txHash, err);
    return false;
  }
}

/**
 * Get the expected final stage for a governor
 * Re-exported for convenience
 */
export { getFinalStageForGovernor };

/**
 * Trim timelock cached stages from a specific index onwards
 *
 * @param txHash - The queue transaction hash
 * @param operationId - The timelock operation ID
 * @param fromIndex - Index to start trimming from (inclusive, relative to timelock stages)
 * @returns True if stages were trimmed, false if nothing to trim
 */
export function trimTimelockCacheFromIndex(
  txHash: string,
  operationId: string,
  fromIndex: number
): boolean {
  if (!isBrowser) return false;

  try {
    const key = getTimelockCacheKey(txHash, operationId);
    const cached = localStorage.getItem(key);
    if (!cached) return false;

    const parsed: CachedTimelockResult = JSON.parse(cached);
    if (parsed.version !== CACHE_VERSION) return false;

    // Trim stages from the specified index
    const trimmedStages = parsed.result.stages.slice(0, fromIndex);

    // If no stages left, clear the cache entirely
    if (trimmedStages.length === 0) {
      clearCachedTimelockResult(txHash, operationId);
      return true;
    }

    // Update the cached result with trimmed stages
    const updatedResult: TimelockTrackingResult = {
      ...parsed.result,
      stages: trimmedStages,
    };

    // Save back to localStorage
    const updatedCache: CachedTimelockResult = {
      version: CACHE_VERSION,
      timestamp: Date.now(), // Update timestamp to mark as fresh
      result: updatedResult,
    };

    localStorage.setItem(key, JSON.stringify(updatedCache));
    debug.cache(
      "trimmed timelock stages from index %d for %s",
      fromIndex,
      txHash
    );
    return true;
  } catch (err) {
    debug.cache("failed to trim timelock stages for %s: %O", txHash, err);
    return false;
  }
}

/**
 * Trim unified cache from a specific stage index
 *
 * This handles trimming across both proposal and timelock caches.
 * The stageIndex is relative to the unified stages array.
 *
 * Stage mapping:
 * - Indices 0-2: Proposal cache (PROPOSAL_CREATED, VOTING_ACTIVE, PROPOSAL_QUEUED)
 * - Indices 3+: Timelock cache (L2_TIMELOCK onwards)
 *
 * @param proposalId - The proposal ID
 * @param governorAddress - The governor contract address
 * @param unifiedStageIndex - Index in the unified stages array to trim from (inclusive)
 * @returns True if any cache was trimmed
 */
export function trimUnifiedCacheFromIndex(
  proposalId: string,
  governorAddress: string,
  unifiedStageIndex: number
): boolean {
  if (!isBrowser) return false;

  // Load current unified cache to get timelockLink
  const unifiedResult = loadUnifiedStages(proposalId, governorAddress);

  let trimmed = false;

  // Determine which cache(s) to trim based on the index
  // Proposal cache has stages 0-2 (PROPOSAL_CREATED, VOTING_ACTIVE, PROPOSAL_QUEUED)
  const PROPOSAL_STAGES_COUNT = 3;

  if (unifiedStageIndex < PROPOSAL_STAGES_COUNT) {
    // Trimming within proposal cache - also clear timelock cache
    trimmed =
      trimCachedStagesFromIndex(
        proposalId,
        governorAddress,
        unifiedStageIndex
      ) || trimmed;

    // Clear timelock cache completely since we're before it
    if (unifiedResult.timelockLink) {
      clearCachedTimelockResult(
        unifiedResult.timelockLink.txHash,
        unifiedResult.timelockLink.operationId
      );
      trimmed = true;
    }
  } else {
    // Trimming within timelock cache - keep proposal cache intact
    const timelockIndex = unifiedStageIndex - PROPOSAL_STAGES_COUNT;

    if (unifiedResult.timelockLink) {
      trimmed =
        trimTimelockCacheFromIndex(
          unifiedResult.timelockLink.txHash,
          unifiedResult.timelockLink.operationId,
          timelockIndex
        ) || trimmed;
    }
  }

  return trimmed;
}
