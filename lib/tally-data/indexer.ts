"use client";

import {
  DELEGATE_LIST_MAX_ROWS,
  DELEGATE_MIN_VOTING_POWER_WEI,
} from "@/config/delegates";
import type {
  DelegateCountParams,
  DelegatePageParams,
  TallyAddressDisplayRecord,
  TallyCandidateSummary,
  TallyDataClient,
  TallyDataStats,
  TallyDelegateCountResult,
  TallyDelegateListResult,
  TallyDelegateProfile,
  TallyDelegateSearchResult,
  TallyDelegateSummary,
  TallyDelegateVote,
  TallyElectionCandidate,
  TallyProposalIndexEntry,
  TallyProposalVoteSummary,
  TallyProposalVoteSummaryEntry,
  TallyProposalVoteSupport,
  TallyProposalVoter,
} from "@/lib/tally-data/types";

const ADDRESS_BATCH_SIZE = 200;

function normalizeAddress(address: string): string {
  return address.toLowerCase();
}

function uniqueNormalizedAddresses(addresses: string[]): string[] {
  return Array.from(
    new Set(
      addresses.filter(Boolean).map((address) => normalizeAddress(address))
    )
  );
}

function mapByAddress<T extends { address: string }>(
  rows: T[]
): Map<string, T> {
  return new Map(rows.map((row) => [normalizeAddress(row.address), row]));
}

function queryString(params: Record<string, string | number | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, String(value));
  }
  const value = search.toString();
  return value ? `?${value}` : "";
}

async function fetchIndexer<T>(path: string): Promise<T> {
  const response = await fetch(`/api/governance-indexer/${path}`, {
    headers: { accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Governance indexer request failed: ${response.status}`);
  }
  return (await response.json()) as T;
}

async function fetchAddressMap<T extends { address: string }>(
  endpoint: string,
  addresses: string[]
): Promise<Map<string, T>> {
  const normalized = uniqueNormalizedAddresses(addresses);
  if (normalized.length === 0) return new Map();

  const rows: T[] = [];
  for (let i = 0; i < normalized.length; i += ADDRESS_BATCH_SIZE) {
    const batch = normalized.slice(i, i + ADDRESS_BATCH_SIZE);
    rows.push(
      ...(await fetchIndexer<T[]>(
        `${endpoint}${queryString({ addresses: batch.join(",") })}`
      ))
    );
  }

  return mapByAddress(rows);
}

export class IndexerTallyDataClient implements TallyDataClient {
  getDelegateList(
    minVotingPower = DELEGATE_MIN_VOTING_POWER_WEI,
    limit = DELEGATE_LIST_MAX_ROWS
  ) {
    return fetchIndexer<TallyDelegateListResult>(
      `api/tally/delegates${queryString({ minVotingPower, limit })}`
    );
  }

  getDelegatesPage({
    minVotingPower,
    query,
    exclude,
    limit,
    offset,
    sort,
    dir,
    seed,
  }: DelegatePageParams) {
    return fetchIndexer<TallyDelegateListResult>(
      `api/tally/delegates${queryString({
        minVotingPower,
        query: query || undefined,
        exclude: exclude?.length ? exclude.join(",") : undefined,
        limit,
        offset,
        sort,
        dir,
        seed: seed || undefined,
      })}`
    );
  }

  getDelegateCount({
    minVotingPower,
    query,
    exclude,
  }: DelegateCountParams = {}) {
    return fetchIndexer<TallyDelegateCountResult>(
      `api/tally/delegate-count${queryString({
        minVotingPower,
        query: query || undefined,
        exclude: exclude?.length ? exclude.join(",") : undefined,
      })}`
    );
  }

  getDelegate(address: string) {
    return fetchIndexer<TallyDelegateProfile | null>(
      `api/tally/delegates/${normalizeAddress(address)}`
    );
  }

  async getDelegateSummaries(
    addresses: string[]
  ): Promise<Map<string, TallyDelegateSummary>> {
    return fetchAddressMap<TallyDelegateSummary>(
      "api/tally/delegate-summaries",
      addresses
    );
  }

  searchDelegates(query: string, limit = 1000) {
    return fetchIndexer<TallyDelegateSearchResult[]>(
      `api/tally/delegates${queryString({ query, limit })}`
    );
  }

  getCandidate(address: string) {
    return fetchIndexer<TallyElectionCandidate | null>(
      `api/tally/candidates/${normalizeAddress(address)}`
    );
  }

  async getCandidateSummaries(
    addresses: string[]
  ): Promise<Map<string, TallyCandidateSummary>> {
    return fetchAddressMap<TallyCandidateSummary>(
      "api/tally/candidate-summaries",
      addresses
    );
  }

  async getAddressDisplayRecords(
    addresses: string[]
  ): Promise<Map<string, TallyAddressDisplayRecord>> {
    return fetchAddressMap<TallyAddressDisplayRecord>(
      "api/tally/address-display-records",
      addresses
    );
  }

  getDelegateVotes(address: string) {
    return fetchIndexer<TallyDelegateVote[]>(
      `api/tally/delegates/${normalizeAddress(address)}/votes`
    );
  }

  getProposalVotes(proposalId: string, governorAddress: string) {
    return fetchIndexer<TallyProposalVoter[]>(
      `api/tally/proposals/${normalizeAddress(governorAddress)}/${proposalId}/votes`
    );
  }

  getProposalVoteSummary(proposalId: string, governorAddress: string) {
    return fetchIndexer<TallyProposalVoteSummary>(
      `api/tally/proposals/${normalizeAddress(
        governorAddress
      )}/${proposalId}/vote-summary`
    );
  }

  /** One aggregated request served by this app's own API route, not the proxy */
  async getAllProposalVoteSummaries(): Promise<
    TallyProposalVoteSummaryEntry[]
  > {
    const response = await fetch("/api/proposal-vote-summaries", {
      headers: { accept: "application/json" },
    });
    if (!response.ok) {
      throw new Error(`Vote summaries request failed: ${response.status}`);
    }
    return (await response.json()) as TallyProposalVoteSummaryEntry[];
  }

  getProposalVotersPage(
    proposalId: string,
    governorAddress: string,
    support: TallyProposalVoteSupport,
    offset: number,
    limit: number
  ) {
    return fetchIndexer<TallyProposalVoter[]>(
      `api/tally/proposals/${normalizeAddress(
        governorAddress
      )}/${proposalId}/votes${queryString({ support, offset, limit })}`
    );
  }

  getProposalsIndex() {
    return fetchIndexer<TallyProposalIndexEntry[]>("api/tally/proposals");
  }

  getProposalIndexEntry(proposalId: string, governorAddress: string) {
    return fetchIndexer<TallyProposalIndexEntry | null>(
      `api/tally/proposals/${normalizeAddress(governorAddress)}/${proposalId}`
    );
  }

  async getDelegateVotesWatermarkBlock(): Promise<number> {
    const { blockNumber } = await fetchIndexer<{ blockNumber: number }>(
      "api/tally/delegate-votes-watermark"
    );
    return blockNumber;
  }

  getStats(): Promise<TallyDataStats> {
    return fetchIndexer<TallyDataStats>("api/tally/stats");
  }
}
