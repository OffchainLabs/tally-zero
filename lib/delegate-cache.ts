/**
 * Delegate cache utilities
 *
 * Provides functions for loading, validating, and querying the delegate
 * cache containing ARB token delegate voting power data.
 */

import { STORAGE_KEYS } from "@/config/storage-keys";
import type {
  DelegateCache,
  DelegateCacheStats,
  DelegateInfo,
} from "@/types/delegate";
import delegateLabelsData from "@data/delegate-labels.json";
import { debug } from "./debug";
import { formatCacheAge } from "./format-utils";
import { getStoredValue } from "./storage-utils";

/** Current cache format version for compatibility checks */
export const CURRENT_DELEGATE_CACHE_VERSION = 1;

// Type for the delegate labels JSON structure
interface DelegateLabelsConfig {
  version: number;
  description: string;
  delegates: Record<string, string>;
}

const delegateLabels = delegateLabelsData as DelegateLabelsConfig;

/**
 * Get the human-readable label for a delegate address
 * @param address - The delegate's Ethereum address
 * @returns The delegate's label if found, undefined otherwise
 */
export function getDelegateLabel(address: string): string | undefined {
  if (delegateLabels.delegates[address]) {
    return delegateLabels.delegates[address];
  }

  const lowerAddress = address.toLowerCase();
  for (const [addr, label] of Object.entries(delegateLabels.delegates)) {
    if (addr.toLowerCase() === lowerAddress) {
      return label;
    }
  }

  return undefined;
}

/**
 * Check if delegate cache should be skipped based on user settings
 *
 * @returns True if user has disabled delegate cache
 */
function getSkipDelegateCacheSetting(): boolean {
  return (
    getStoredValue<boolean>(STORAGE_KEYS.SKIP_DELEGATE_CACHE, false) === true
  );
}

let staticCacheData: DelegateCache | null = null;
try {
  staticCacheData = require("@data/delegate-cache.json") as DelegateCache;
} catch {
  staticCacheData = null;
}

let validatedCacheData: DelegateCache | null = null;
let cacheValidated = false;

/**
 * Load and validate the delegate cache from static data
 * Returns cached data on subsequent calls for performance.
 * @returns The validated delegate cache, or null if unavailable/invalid
 */
export async function loadDelegateCache(): Promise<DelegateCache | null> {
  if (getSkipDelegateCacheSetting()) {
    debug.delegates("skipping preload cache (setting enabled)");
    return null;
  }

  if (cacheValidated) {
    debug.delegates("returning validated cache (already loaded)");
    return validatedCacheData;
  }

  cacheValidated = true;

  if (!staticCacheData) {
    debug.delegates("cache file not found - run cache build to generate");
    return null;
  }

  // Validate cache version
  if (staticCacheData.version !== CURRENT_DELEGATE_CACHE_VERSION) {
    debug.delegates(
      "cache version mismatch: expected %d, got %d",
      CURRENT_DELEGATE_CACHE_VERSION,
      staticCacheData.version
    );
    return null;
  }

  // Validate that delegates exist
  if (!staticCacheData.delegates || !Array.isArray(staticCacheData.delegates)) {
    debug.delegates("invalid cache format: missing delegates array");
    return null;
  }

  validatedCacheData = staticCacheData;

  // Calculate some useful stats
  const totalPower = BigInt(validatedCacheData.totalVotingPower);
  const topDelegatePower = BigInt(
    validatedCacheData.delegates[0]?.votingPower ?? "0"
  );
  const top10Power = validatedCacheData.delegates
    .slice(0, 10)
    .reduce((sum, d) => sum + BigInt(d.votingPower), BigInt(0));

  debug.delegates(
    "loaded %d delegates from cache (block %d)",
    validatedCacheData.delegates.length,
    validatedCacheData.snapshotBlock
  );
  debug.delegates(
    "top delegate: %s%% of total, top 10: %s%% of total",
    ((topDelegatePower * BigInt(10000)) / totalPower / BigInt(100)).toString(),
    ((top10Power * BigInt(10000)) / totalPower / BigInt(100)).toString()
  );

  return validatedCacheData;
}

/**
 * Clear the validated delegate cache data
 * Useful for forcing a cache refresh
 */
export function clearDelegateCacheData(): void {
  validatedCacheData = null;
  cacheValidated = false;
}

/**
 * Get the snapshot block number from the delegate cache
 * @returns The block number when the cache was generated, or 0 if no cache
 */
export async function getDelegateCacheSnapshotBlock(): Promise<number> {
  const cache = await loadDelegateCache();
  return cache?.snapshotBlock ?? 0;
}

/**
 * Get statistics about the delegate cache
 * @param cache - The delegate cache to analyze
 * @returns Cache statistics including delegate count, age, and voting power
 */
export function getDelegateCacheStats(
  cache: DelegateCache
): DelegateCacheStats {
  const generatedAt = new Date(cache.generatedAt);

  return {
    totalDelegates: cache.stats.totalDelegates,
    snapshotBlock: cache.snapshotBlock,
    generatedAt,
    age: formatCacheAge(generatedAt),
    totalVotingPower: cache.totalVotingPower,
    totalSupply: cache.totalSupply,
  };
}

/**
 * Get the top delegates by voting power
 * @param cache - The delegate cache
 * @param limit - Maximum number of delegates to return (default: 100)
 * @returns Array of top delegates sorted by voting power descending
 */
export function getTopDelegates(
  cache: DelegateCache,
  limit: number = 100
): DelegateInfo[] {
  return cache.delegates.slice(0, limit);
}

/**
 * Find a delegate by their Ethereum address
 * @param cache - The delegate cache to search
 * @param address - The Ethereum address to look up
 * @returns The delegate info if found, undefined otherwise
 */
export function findDelegateByAddress(
  cache: DelegateCache,
  address: string
): DelegateInfo | undefined {
  const normalizedAddress = address.toLowerCase();
  return cache.delegates.find(
    (d) => d.address.toLowerCase() === normalizedAddress
  );
}

/**
 * Filter delegates by minimum voting power
 * @param cache - The delegate cache to filter
 * @param minPowerWei - Minimum voting power in wei (as string)
 * @returns Array of delegates meeting the minimum power threshold
 */
export function getDelegatesWithMinPower(
  cache: DelegateCache,
  minPowerWei: string
): DelegateInfo[] {
  const minPower = BigInt(minPowerWei);
  return cache.delegates.filter((d) => BigInt(d.votingPower) >= minPower);
}
