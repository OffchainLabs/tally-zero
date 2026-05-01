/**
 * SQLite-backed delegate data utilities
 *
 * Wraps `@/lib/tally-data/client` to expose delegate list, summaries, profiles,
 * and display records to UI consumers.
 */

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
} from "@/lib/tally-data/types";
import type { DelegateCacheStats } from "@/types/delegate";

import { formatCacheAge } from "./format-utils";

const DEFAULT_MIN_VOTING_POWER = "10000000000000000000";

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

export { useAddressDisplayRecord, useAddressDisplayRecords };
export type {
  TallyAddressDisplayRecord,
  TallyDelegateListItem,
  TallyDelegateListResult,
  TallyDelegateProfile,
  TallyDelegateSummary,
};
