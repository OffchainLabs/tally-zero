/**
 * Proposal cache utilities for pre-loading and merging proposals
 *
 * Provides functionality for loading the prebuilt proposal cache,
 * merging cached proposals with fresh data, and seeding localStorage
 * with stage tracking data.
 */

import { STORAGE_KEYS } from "@/config/storage-keys";
import type { ParsedProposal } from "@/types/proposal";
import type { ProposalStage } from "@/types/proposal-stage";
import { debug, isBrowser } from "./debug";
import { formatCacheAge } from "./format-utils";
import type { TimelockOperationInfo } from "@/hooks/use-timelock-operation";
import { seedStagesFromProposal } from "./stages-cache";
import { getStoredValue } from "./storage-utils";
import { seedTimelockFromCache } from "./unified-cache";

// Re-export stages cache functions for convenience
export {
  getPreloadedStages,
  hasPreloadedStages,
  seedStagesFromProposal,
} from "./stages-cache";

/**
 * Timelock operation entry from the prebuilt cache
 */
interface TimelockOperationEntry {
  txHash: string;
  operationId: string;
  timelockAddress: string;
  queueBlockNumber: number;
  stages: ProposalStage[];
  trackedAt: string;
}

/**
 * Prebuilt timelock operations cache structure
 */
interface TimelockOperationsCache {
  version: number;
  generatedAt: string;
  operations: TimelockOperationEntry[];
}

function getSkipPreloadCacheSetting(): boolean {
  return (
    getStoredValue<boolean>(STORAGE_KEYS.SKIP_PRELOAD_CACHE, false) === true
  );
}

export interface ProposalCache {
  version: number;
  generatedAt: string;
  snapshotBlock: number;
  startBlock: number;
  chainId: number;
  proposals: ParsedProposal[];
  governorStats: {
    [address: string]: {
      name: string;
      proposalCount: number;
    };
  };
}

/** Current version of the proposal cache format */
export const CURRENT_CACHE_VERSION = 1;

/** Proposal states that don't need refresh */
const FINALIZED_STATES = new Set([
  "canceled",
  "defeated",
  "succeeded",
  "queued",
  "expired",
  "executed",
]);

/**
 * Check if a proposal state is finalized (won't change)
 *
 * @param state - The proposal state string
 * @returns True if the proposal is in a finalized state
 */
export function isProposalFinalized(state: string): boolean {
  return FINALIZED_STATES.has(state.toLowerCase());
}

/**
 * Check if a proposal state needs to be refreshed
 *
 * @param state - The proposal state string
 * @returns True if the proposal is pending or active
 */
export function needsStateRefresh(state: string): boolean {
  const lowerState = state.toLowerCase();
  return lowerState === "pending" || lowerState === "active";
}

let staticCacheData: ProposalCache | null = null;
try {
  staticCacheData = require("@data/proposal-cache.json") as ProposalCache;
} catch {
  staticCacheData = null;
}

let staticTimelockCacheData: TimelockOperationsCache | null = null;
try {
  staticTimelockCacheData =
    require("@data/timelock-operations-cache.json") as TimelockOperationsCache;
} catch {
  staticTimelockCacheData = null;
}

let validatedCacheData: ProposalCache | null = null;
let cacheValidated = false;
let stagesSeeded = false;
let timelockStagesSeeded = false;

/**
 * Load and validate the proposal cache from static data
 *
 * Seeds localStorage with stage data on first load.
 * Returns cached data on subsequent calls for performance.
 *
 * @returns The validated proposal cache, or null if unavailable/invalid
 */
export async function loadProposalCache(): Promise<ProposalCache | null> {
  if (getSkipPreloadCacheSetting()) {
    debug.proposals("skipping preload cache (setting enabled)");
    return null;
  }

  if (cacheValidated) {
    debug.proposals("returning validated cache (already loaded)");
    if (validatedCacheData && !stagesSeeded) {
      seedAllStagesFromCache(validatedCacheData);
      stagesSeeded = true;
    }
    if (!timelockStagesSeeded) {
      seedTimelockOperationsFromCache();
      timelockStagesSeeded = true;
    }
    return validatedCacheData;
  }

  cacheValidated = true;

  if (!staticCacheData) {
    debug.proposals(
      "cache file not found - run 'yarn cache:build' to generate"
    );
    return null;
  }

  // Validate cache version
  if (staticCacheData.version !== CURRENT_CACHE_VERSION) {
    debug.proposals(
      "cache version mismatch: expected %d, got %d",
      CURRENT_CACHE_VERSION,
      staticCacheData.version
    );
    return null;
  }

  // Validate that proposals exist
  if (!staticCacheData.proposals || !Array.isArray(staticCacheData.proposals)) {
    debug.proposals("invalid cache format: missing proposals array");
    return null;
  }

  validatedCacheData = staticCacheData;

  const activeCount = validatedCacheData.proposals.filter(
    (p) => p.state === "Active" || p.state === "Pending"
  ).length;
  debug.proposals(
    "loaded %d proposals from cache (block %d, %d active/pending)",
    validatedCacheData.proposals.length,
    validatedCacheData.snapshotBlock,
    activeCount
  );

  // Seed localStorage with preloaded stages
  seedAllStagesFromCache(validatedCacheData);
  stagesSeeded = true;

  // Seed timelock operations from prebuilt cache
  seedTimelockOperationsFromCache();
  timelockStagesSeeded = true;

  return validatedCacheData;
}

/**
 * Clear the validated proposal cache data
 *
 * Useful for forcing a cache refresh.
 */
export function clearCacheData(): void {
  validatedCacheData = null;
  cacheValidated = false;
  stagesSeeded = false;
  timelockStagesSeeded = false;
}

/**
 * Get the snapshot block number from the proposal cache
 *
 * @returns The block number when the cache was generated, or 0 if no cache
 */
export async function getCacheSnapshotBlock(): Promise<number> {
  const cache = await loadProposalCache();
  return cache?.snapshotBlock ?? 0;
}

/**
 * Get proposals that need their state refreshed
 *
 * @param cache - The proposal cache
 * @returns Array of proposals in pending or active state
 */
export function getProposalsNeedingRefresh(
  cache: ProposalCache
): ParsedProposal[] {
  return cache.proposals.filter((p) => needsStateRefresh(p.state));
}

/**
 * Merge cached proposals with freshly fetched proposals
 *
 * Keeps finalized proposals from cache, uses fresh data for active proposals,
 * and adds any new proposals not in cache.
 *
 * @param cachedProposals - Proposals from the prebuilt cache
 * @param freshProposals - Proposals freshly fetched from RPC
 * @returns Merged array of proposals
 */
export function mergeProposals(
  cachedProposals: ParsedProposal[],
  freshProposals: ParsedProposal[]
): ParsedProposal[] {
  const freshMap = new Map<string, ParsedProposal>();
  for (const p of freshProposals) {
    freshMap.set(p.id, p);
  }

  const cachedIds = new Set(cachedProposals.map((p) => p.id));
  const merged: ParsedProposal[] = [];

  for (const cached of cachedProposals) {
    if (isProposalFinalized(cached.state)) {
      merged.push(cached);
    } else {
      const fresh = freshMap.get(cached.id);
      merged.push(fresh ?? cached);
    }
  }

  for (const fresh of freshProposals) {
    if (!cachedIds.has(fresh.id)) {
      merged.push(fresh);
    }
  }

  return merged;
}

/**
 * Sort proposals by state and start block
 *
 * Active proposals come first, then sorted by start block descending.
 *
 * @param proposals - Array of proposals to sort
 * @returns Sorted array of proposals
 */
export function sortProposals(proposals: ParsedProposal[]): ParsedProposal[] {
  return [...proposals].sort((a, b) => {
    if (a.state === "Active" && b.state !== "Active") return -1;
    if (a.state !== "Active" && b.state === "Active") return 1;
    return parseInt(b.startBlock, 10) - parseInt(a.startBlock, 10);
  });
}

/**
 * Get statistics about the proposal cache
 *
 * @param cache - The proposal cache to analyze
 * @returns Cache statistics including proposal count, age, and state distribution
 */
export function getCacheStats(cache: ProposalCache): {
  totalProposals: number;
  snapshotBlock: number;
  generatedAt: Date;
  age: string;
  stateDistribution: Record<string, number>;
} {
  const generatedAt = new Date(cache.generatedAt);

  const stateDistribution: Record<string, number> = {};
  for (const p of cache.proposals) {
    stateDistribution[p.state] = (stateDistribution[p.state] || 0) + 1;
  }

  return {
    totalProposals: cache.proposals.length,
    snapshotBlock: cache.snapshotBlock,
    generatedAt,
    age: formatCacheAge(generatedAt),
    stateDistribution,
  };
}

/**
 * Seed localStorage with stages from all cached proposals
 *
 * @param cache - The proposal cache containing proposals with stages
 * @returns Number of proposals seeded
 */
export function seedAllStagesFromCache(cache: ProposalCache): number {
  if (!isBrowser) return 0;

  if (getSkipPreloadCacheSetting()) {
    debug.proposals("skipping stages seeding (setting enabled)");
    return 0;
  }

  let seededCount = 0;
  for (const proposal of cache.proposals) {
    if (seedStagesFromProposal(proposal)) {
      seededCount++;
    }
  }

  if (seededCount > 0) {
    debug.proposals("seeded %d proposals with preloaded stages", seededCount);
  }

  return seededCount;
}

/**
 * Seed timelock operations cache from prebuilt cache
 *
 * This loads the prebuilt timelock-operations-cache.json and seeds
 * localStorage with stages 4-10 for each operation.
 *
 * @returns Number of operations seeded
 */
export function seedTimelockOperationsFromCache(): number {
  if (!isBrowser) return 0;

  if (getSkipPreloadCacheSetting()) {
    debug.proposals("skipping timelock seeding (setting enabled)");
    return 0;
  }

  if (!staticTimelockCacheData) {
    debug.proposals("no timelock cache data available");
    return 0;
  }

  if (staticTimelockCacheData.version !== CURRENT_CACHE_VERSION) {
    debug.proposals(
      "timelock cache version mismatch: expected %d, got %d",
      CURRENT_CACHE_VERSION,
      staticTimelockCacheData.version
    );
    return 0;
  }

  let seededCount = 0;
  for (const operation of staticTimelockCacheData.operations) {
    // Create a minimal TimelockTrackingResult for seeding
    const result = {
      operationInfo: {
        operationId: operation.operationId,
        target: "",
        value: "0",
        data: "0x",
        predecessor:
          "0x0000000000000000000000000000000000000000000000000000000000000000",
        delay: "0",
        txHash: operation.txHash,
        blockNumber: operation.queueBlockNumber,
        timestamp: 0,
        timelockAddress: operation.timelockAddress,
      } as TimelockOperationInfo,
      stages: operation.stages,
    };

    if (
      seedTimelockFromCache(
        operation.txHash,
        operation.operationId,
        result,
        operation.trackedAt
      )
    ) {
      seededCount++;
    }
  }

  if (seededCount > 0) {
    debug.proposals(
      "seeded %d timelock operations with preloaded stages",
      seededCount
    );
  }

  return seededCount;
}
