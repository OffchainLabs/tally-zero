/**
 * Delegate cache utilities — thin wrapper around gov-tracker SDK
 *
 * The SDK provides cache querying functions. This module handles:
 * - Browser-compatible cache loading (require() instead of fs.readFileSync)
 * - Delegate label lookups (editorial data, not in SDK)
 * - UI-specific stats formatting (age computation)
 */

import {
  getDelegateCacheStats as sdkGetDelegateCacheStats,
  getDelegateRankInfo as sdkGetDelegateRankInfo,
  getTopDelegates as sdkGetTopDelegates,
  validateDelegateCache,
  type DelegateCache,
  type DelegateInfo,
} from "@gzeoneth/gov-tracker";

import { STORAGE_KEYS } from "@/config/storage-keys";
import type { DelegateCacheStats } from "@/types/delegate";
import type { DelegateIndex } from "@/types/tally-delegate";
import delegateIndexData from "@data/delegate-index.json";
import delegateLabelsData from "@data/delegate-labels.json";

import { debug } from "./debug";
import { formatCacheAge } from "./format-utils";
import { getStoredValue } from "./storage-utils";

interface DelegateLabelsConfig {
  version: number;
  description: string;
  delegates: Record<string, string>;
}

const delegateLabels = delegateLabelsData as DelegateLabelsConfig;
const delegateIndex = delegateIndexData as DelegateIndex;

const normalizedDelegateLabels = new Map<string, string>();
for (const [addr, label] of Object.entries(delegateLabels.delegates)) {
  normalizedDelegateLabels.set(addr.toLowerCase(), label);
}

/**
 * Returns a display label for a delegate address.
 * Checks curated delegate-labels.json first, then falls back
 * to the name from delegate-index.json (derived from Tally profiles).
 */
export function getDelegateLabel(address: string): string | undefined {
  const key = address.toLowerCase();
  return normalizedDelegateLabels.get(key) ?? delegateIndex[key]?.name;
}

function getSkipDelegateCacheSetting(): boolean {
  return (
    getStoredValue<boolean>(STORAGE_KEYS.SKIP_DELEGATE_CACHE, false) === true
  );
}

let staticCacheData: DelegateCache | null = null;
try {
  const raw = require("@gzeoneth/gov-tracker/delegate-cache.json");
  if (validateDelegateCache(raw)) {
    staticCacheData = raw;
  }
} catch {
  staticCacheData = null;
}

let validatedCacheData: DelegateCache | null = null;
let cacheValidated = false;

export async function loadDelegateCache(): Promise<DelegateCache | null> {
  if (getSkipDelegateCacheSetting()) {
    debug.delegates("skipping delegate cache (setting enabled)");
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

  validatedCacheData = staticCacheData;

  debug.delegates(
    "loaded %d delegates from cache (block %d)",
    validatedCacheData.delegates.length,
    validatedCacheData.snapshotBlock
  );

  return validatedCacheData;
}

export function clearDelegateCacheData(): void {
  validatedCacheData = null;
  cacheValidated = false;
}

export async function getDelegateRankInfo(
  address: string
): Promise<{ rank: number; votingPower: string } | undefined> {
  const cache = await loadDelegateCache();
  if (!cache) return undefined;
  return sdkGetDelegateRankInfo(cache, address);
}

export async function getDelegateCacheSnapshotBlock(): Promise<number> {
  const cache = await loadDelegateCache();
  return cache?.snapshotBlock ?? 0;
}

export function getDelegateCacheStats(
  cache: DelegateCache
): DelegateCacheStats {
  const sdkStats = sdkGetDelegateCacheStats(cache);
  const generatedAt = new Date(sdkStats.generatedAt);

  return {
    totalDelegates: sdkStats.totalDelegates,
    snapshotBlock: sdkStats.snapshotBlock,
    generatedAt,
    age: formatCacheAge(generatedAt),
    totalVotingPower: sdkStats.totalVotingPower,
    totalSupply: sdkStats.totalSupply,
  };
}

export function getTopDelegates(
  cache: DelegateCache,
  limit: number = 100
): DelegateInfo[] {
  return sdkGetTopDelegates(cache, limit);
}
