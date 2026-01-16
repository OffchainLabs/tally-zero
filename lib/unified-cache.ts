/**
 * Timelock operation cache for direct timelock tracking feature
 *
 * Provides localStorage-based caching for timelock operations
 * tracked via the TimelockOperationContent component.
 *
 * Note: Proposal stage caching is handled by gov-tracker's
 * LocalStorageCache via lib/gov-tracker-cache.ts.
 */

import {
  CACHE_VERSION,
  DEFAULT_CACHE_TTL_MS,
  STORAGE_KEYS,
} from "@/config/storage-keys";
import type { TimelockTrackingResult } from "@/hooks/use-timelock-operation";
import { debug, isBrowser } from "./debug";

/**
 * Cached timelock operation result
 */
export interface CachedTimelockResult {
  version: number;
  timestamp: number;
  result: TimelockTrackingResult;
}

/**
 * Get cache key for timelock operations
 */
export function getTimelockCacheKey(
  txHash: string,
  operationId: string
): string {
  return `${STORAGE_KEYS.TIMELOCK_OP_CACHE_PREFIX}${txHash.toLowerCase()}-${operationId.toLowerCase()}`;
}

/**
 * Load cached timelock result from localStorage
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
 * Check if timelock cache exists and is valid
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
