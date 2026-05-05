/**
 * Delegate cache utilities — thin wrapper around gov-tracker SDK
 *
 * The SDK provides cache querying functions. This module handles:
 * - Browser-compatible cache loading (require() instead of fs.readFileSync)
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
import {
  getAddressDisplayRecord,
  getAddressDisplayRecords,
  getCachedAddressDisplayRecord,
  getTallyDataClient,
  useAddressDisplayRecord,
  useAddressDisplayRecords,
} from "@/lib/tally-data/client";
import type {
  TallyAddressDisplayRecord,
  TallyDelegateListItem,
  TallyDelegateListResult,
  TallyDelegateProfile,
  TallyDelegateSummary,
  TallyDelegateVote,
  TallyProposalIndexEntry,
} from "@/lib/tally-data/types";
import type { DelegateCacheStats } from "@/types/delegate";

import { debug } from "./debug";
import { formatCacheAge } from "./format-utils";
import { getStoredValue } from "./storage-utils";

const DEFAULT_MIN_VOTING_POWER = "10000000000000000000";

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

export async function loadDelegateList(
  minVotingPower = DEFAULT_MIN_VOTING_POWER
): Promise<TallyDelegateListResult> {
  return getTallyDataClient().getDelegateList(minVotingPower);
}

export function getDelegateListStats(
  delegateList: TallyDelegateListResult
): DelegateCacheStats {
  const generatedAt = new Date();

  return {
    totalDelegates: delegateList.delegates.length,
    snapshotBlock: 0,
    generatedAt,
    age: formatCacheAge(generatedAt),
    totalVotingPower: delegateList.totalVotingPower,
    totalSupply: delegateList.totalSupply,
  };
}

export function delegateMatchesSearch(
  delegate: TallyDelegateListItem,
  rawFilter: string
): boolean {
  const filter = rawFilter.trim().toLowerCase();
  if (!filter) return true;

  return [
    delegate.address,
    delegate.displayName,
    delegate.knownLabel,
    delegate.name,
    delegate.ens,
  ].some((value) => value?.toLowerCase().includes(filter));
}

export async function getDelegateProfile(
  address: string
): Promise<TallyDelegateProfile | null> {
  return getTallyDataClient().getDelegate(address);
}

export async function getDelegateSummaries(
  addresses: string[]
): Promise<Map<string, TallyDelegateSummary>> {
  return getTallyDataClient().getDelegateSummaries(addresses);
}

export async function getDelegateDisplayRecords(
  addresses: string[]
): Promise<Map<string, TallyAddressDisplayRecord>> {
  return getAddressDisplayRecords(addresses);
}

export async function getDelegateDisplayRecord(
  address: string
): Promise<TallyAddressDisplayRecord | undefined> {
  return getAddressDisplayRecord(address);
}

export function getDelegateLabel(address: string): string | undefined {
  return getCachedAddressDisplayRecord(address)?.label ?? undefined;
}

export function getDelegatePicture(address: string): string | null {
  return getCachedAddressDisplayRecord(address)?.picture ?? null;
}

export async function getDelegateVotes(
  address: string
): Promise<TallyDelegateVote[]> {
  return getTallyDataClient().getDelegateVotes(address);
}

export async function getProposalsIndex(): Promise<TallyProposalIndexEntry[]> {
  return getTallyDataClient().getProposalsIndex();
}

export async function getDelegateVotesWatermarkBlock(): Promise<number> {
  const value = await getTallyDataClient().getBuildMetadata(
    "delegate_votes_watermark_block"
  );
  return value ? Number(value) : 0;
}

export { useAddressDisplayRecord, useAddressDisplayRecords };
export type {
  TallyAddressDisplayRecord,
  TallyDelegateListItem,
  TallyDelegateListResult,
  TallyDelegateProfile,
  TallyDelegateSummary,
  TallyDelegateVote,
  TallyProposalIndexEntry,
};
