/**
 * CacheAdapter implementation for gov-tracker using TallyZero's localStorage cache
 *
 * This adapter bridges TallyZero's existing cache format with gov-tracker's
 * TrackingCheckpoint format, enabling zero-RPC resume from cached stages.
 */

import { STORAGE_KEYS } from "@/config/storage-keys";
import type {
  CacheAdapter,
  TrackedStage,
  TrackingCheckpoint,
} from "@gzeoneth/gov-tracker";
import { debug, isBrowser } from "./debug";

/**
 * Build gov-tracker cache key for a proposal
 * @deprecated Use buildTxHashCacheKey instead - gov-tracker uses tx hash as primary key
 */
export function buildProposalCacheKey(
  governorAddress: string,
  proposalId: string
): string {
  return `proposal:${governorAddress.toLowerCase()}:${proposalId}`;
}

/**
 * Build gov-tracker cache key from transaction hash
 * This matches gov-tracker's internal txHashCacheKey() format
 */
export function buildTxHashCacheKey(txHash: string): string {
  return `tx:${txHash.toLowerCase()}`;
}

/**
 * Build gov-tracker cache key for a timelock operation
 */
export function buildTimelockCacheKey(
  timelockAddress: string,
  operationId: string
): string {
  return `timelock:${timelockAddress.toLowerCase()}:${operationId.toLowerCase()}`;
}

/**
 * Build localStorage key from gov-tracker cache key
 */
function toStorageKey(key: string): string {
  return `${STORAGE_KEYS.CHECKPOINT_CACHE_PREFIX}${key}`;
}

/**
 * CacheAdapter for gov-tracker that uses localStorage
 *
 * This adapter stores TrackingCheckpoints in localStorage, enabling
 * gov-tracker to resume from cached stages without re-fetching RPC data.
 */
export class LocalStorageCacheAdapter implements CacheAdapter {
  async get<T>(key: string): Promise<T | null> {
    if (!isBrowser) return null;

    try {
      const storageKey = toStorageKey(key);
      const data = localStorage.getItem(storageKey);
      if (!data) return null;
      return JSON.parse(data) as T;
    } catch (err) {
      debug.cache("gov-tracker cache get error for %s: %O", key, err);
      return null;
    }
  }

  async set<T>(key: string, value: T): Promise<void> {
    if (!isBrowser) return;

    try {
      const storageKey = toStorageKey(key);
      localStorage.setItem(storageKey, JSON.stringify(value));
    } catch (err) {
      debug.cache("gov-tracker cache set error for %s: %O", key, err);
    }
  }

  async delete(key: string): Promise<void> {
    if (!isBrowser) return;

    try {
      const storageKey = toStorageKey(key);
      localStorage.removeItem(storageKey);
    } catch (err) {
      debug.cache("gov-tracker cache delete error for %s: %O", key, err);
    }
  }

  async clear(): Promise<void> {
    if (!isBrowser) return;

    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(STORAGE_KEYS.CHECKPOINT_CACHE_PREFIX)) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((key) => localStorage.removeItem(key));
    } catch (err) {
      debug.cache("gov-tracker cache clear error: %O", err);
    }
  }

  async has(key: string): Promise<boolean> {
    if (!isBrowser) return false;

    try {
      const storageKey = toStorageKey(key);
      return localStorage.getItem(storageKey) !== null;
    } catch (err) {
      debug.cache("gov-tracker cache has error for %s: %O", key, err);
      return false;
    }
  }

  async keys(prefix?: string): Promise<string[]> {
    if (!isBrowser) return [];

    try {
      const result: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const storageKey = localStorage.key(i);
        if (storageKey?.startsWith(STORAGE_KEYS.CHECKPOINT_CACHE_PREFIX)) {
          const key = storageKey.slice(
            STORAGE_KEYS.CHECKPOINT_CACHE_PREFIX.length
          );
          if (!prefix || key.startsWith(prefix)) {
            result.push(key);
          }
        }
      }
      return result;
    } catch (err) {
      debug.cache("gov-tracker cache keys error: %O", err);
      return [];
    }
  }
}

/**
 * Seed gov-tracker cache from TallyZero's existing proposal cache
 *
 * This bridges the gap between TallyZero's cache format and gov-tracker's
 * checkpoint format, allowing existing cached stages to be used for resume.
 *
 * @param cache - The cache adapter to seed
 * @param proposalId - The proposal ID
 * @param governorAddress - The governor address
 * @param creationTxHash - The creation transaction hash
 * @param stages - The cached stages from TallyZero
 */
export async function seedCheckpointFromStages(
  cache: CacheAdapter,
  proposalId: string,
  governorAddress: string,
  creationTxHash: string,
  stages: TrackedStage[]
): Promise<void> {
  if (stages.length === 0) return;

  // Use tx hash as key - this matches gov-tracker's internal txHashCacheKey() format
  const key = buildTxHashCacheKey(creationTxHash);

  // Build checkpoint from existing stages
  const lastStage = stages[stages.length - 1];
  const lastTx = lastStage.transactions[lastStage.transactions.length - 1];

  const checkpoint: TrackingCheckpoint = {
    version: 1,
    createdAt: Date.now(),
    input: {
      type: "governor",
      governorAddress,
      proposalId,
      creationTxHash,
    },
    lastProcessedStage: lastStage.type,
    lastProcessedBlock: {
      l1: 0,
      l2: lastTx?.blockNumber ?? 0,
    },
    cachedData: {
      completedStages: stages.filter((s) => s.status === "COMPLETED"),
    },
    metadata: {
      errorCount: 0,
      lastTrackedAt: Date.now(),
    },
  };

  await cache.set(key, checkpoint);
  debug.cache(
    "seeded checkpoint for %s with %d completed stages",
    proposalId,
    checkpoint.cachedData.completedStages?.length ?? 0
  );
}

/**
 * Clear gov-tracker checkpoint for a proposal by tx hash
 *
 * Called when TallyZero's cache is cleared to keep caches in sync.
 * Uses tx hash as key to match gov-tracker's internal format.
 */
export async function clearProposalCheckpoint(
  cache: CacheAdapter,
  creationTxHash: string
): Promise<void> {
  const key = buildTxHashCacheKey(creationTxHash);
  await cache.delete(key);
}

/**
 * Singleton cache adapter instance
 */
let cacheAdapterInstance: LocalStorageCacheAdapter | null = null;

/**
 * Get the shared cache adapter instance
 */
export function getCacheAdapter(): LocalStorageCacheAdapter {
  if (!cacheAdapterInstance) {
    cacheAdapterInstance = new LocalStorageCacheAdapter();
  }
  return cacheAdapterInstance;
}
