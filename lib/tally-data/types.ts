import type { TallyDelegate } from "@/types/tally-delegate";
import type { SqliteStats } from "sql.js-httpvfs";

export type TallyDelegateProfile = TallyDelegate & {
  knownLabel: string | null;
};

export type TallyDelegateSummary = {
  address: string;
  ens: string | null;
  name: string | null;
  picture: string | null;
  knownLabel: string | null;
  displayName: string | null;
};

export type TallyDelegateSearchResult = TallyDelegateSummary & {
  votesCount: string;
  delegatorsCount: number;
  isPrioritized: boolean;
};

export type TallyDelegateListItem = TallyDelegateSearchResult & {
  address: `0x${string}`;
  votingPower: string;
  lastChangeBlock: number;
};

export type TallyDelegateListResult = {
  delegates: TallyDelegateListItem[];
  totalVotingPower: string;
  totalSupply: string;
};

export type TallyElectionCandidate = {
  address: string;
  name: string;
  title: string | null;
  twitter: string | null;
  type: string | null;
  representative: string | null;
  motivation: string | null;
  experience: string | null;
  skills: unknown;
  projects: string | null;
  country: string | null;
  registeredAt: string | null;
};

export type TallyCandidateSummary = {
  address: string;
  name: string;
  title: string | null;
  type: string | null;
};

export type TallyAddressDisplayRecord = {
  address: string;
  label: string | null;
  title: string | null;
  picture: string | null;
  profileUrl: string | null;
  source: "candidate" | "delegate" | "address";
};

export type TallyDataStats = {
  delegates: number;
  delegateIndex: number;
  delegateLabels: number;
  delegateSearch: number;
  electionCandidates: number;
  httpvfs: SqliteStats | null;
};

export interface TallyDataClient {
  getDelegateList(minVotingPower?: string): Promise<TallyDelegateListResult>;
  getDelegate(address: string): Promise<TallyDelegateProfile | null>;
  getDelegateSummaries(
    addresses: string[]
  ): Promise<Map<string, TallyDelegateSummary>>;
  searchDelegates(
    query: string,
    limit?: number
  ): Promise<TallyDelegateSearchResult[]>;
  getCandidate(address: string): Promise<TallyElectionCandidate | null>;
  getCandidateSummaries(
    addresses: string[]
  ): Promise<Map<string, TallyCandidateSummary>>;
  getAddressDisplayRecords(
    addresses: string[]
  ): Promise<Map<string, TallyAddressDisplayRecord>>;
  getStats(): Promise<TallyDataStats>;
}
