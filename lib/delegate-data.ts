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
  TallyDelegateVote,
  TallyProposalDelegateVote,
  TallyProposalIndexEntry,
  TallyProposalVoteSummary,
  TallyProposalVoteSupport,
  TallyProposalVoter,
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

export async function getDelegateVotes(
  address: string
): Promise<TallyDelegateVote[]> {
  return getTallyDataClient().getDelegateVotes(address);
}

export async function getProposalVotes(
  proposalId: string,
  governorAddress: string
): Promise<TallyProposalVoter[]> {
  return getTallyDataClient().getProposalVotes(proposalId, governorAddress);
}

export async function getProposalVoteSummary(
  proposalId: string,
  governorAddress: string
): Promise<TallyProposalVoteSummary> {
  return getTallyDataClient().getProposalVoteSummary(
    proposalId,
    governorAddress
  );
}

export async function getProposalVotersPage(
  proposalId: string,
  governorAddress: string,
  support: TallyProposalVoteSupport,
  offset: number,
  limit: number
): Promise<TallyProposalVoter[]> {
  return getTallyDataClient().getProposalVotersPage(
    proposalId,
    governorAddress,
    support,
    offset,
    limit
  );
}

export async function getProposalsIndex(): Promise<TallyProposalIndexEntry[]> {
  return getTallyDataClient().getProposalsIndex();
}

export async function getProposalIndexEntry(
  proposalId: string,
  governorAddress: string
): Promise<TallyProposalIndexEntry | null> {
  return getTallyDataClient().getProposalIndexEntry(
    proposalId,
    governorAddress
  );
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
  TallyProposalDelegateVote,
  TallyProposalIndexEntry,
  TallyProposalVoteSummary,
  TallyProposalVoteSupport,
  TallyProposalVoter,
};
