import type { TallyDelegate } from "@/types/tally-delegate";

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

export type TallyDelegateCountResult = {
  totalCount: number;
  totalVotingPower: string;
  totalSupply: string;
};

export type DelegateSortField = "votingPower" | "address" | "random";

export type DelegatePageParams = {
  minVotingPower?: string;
  query?: string;
  exclude?: string[];
  limit: number;
  offset: number;
  sort?: DelegateSortField;
  dir?: "asc" | "desc";
  seed?: string;
};

export type DelegateCountParams = {
  minVotingPower?: string;
  query?: string;
  exclude?: string[];
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
  message: string | null;
  signatureHash: string | null;
};

export type TallyCandidateSummary = {
  address: string;
  name: string;
  title: string | null;
  type: string | null;
};

export type TallyDelegateVote = {
  proposalId: string;
  governorAddress: string;
  support: 0 | 1 | 2;
  weight: string;
  blockNumber: number;
};

export type TallyProposalDelegateVote = TallyDelegateVote & {
  voter: string;
  /**
   * Whose voting power was cast. The voter itself on Arbitrum One; on the L1
   * voting governor, the L2 delegate the L1 voting address is registered to.
   * Optional because an older indexer deployment does not serve it.
   */
  delegate?: string;
};

export type TallyProposalVoter = TallyProposalDelegateVote & {
  display: TallyAddressDisplayRecord;
};

export type TallyProposalVoteSupport = 0 | 1 | 2;

export type TallyProposalSupportSummary = {
  voterCount: number;
  weight: string;
};

export type TallyProposalVoteSummary = {
  for: TallyProposalSupportSummary;
  against: TallyProposalSupportSummary;
  abstain: TallyProposalSupportSummary;
  totalCount: number;
};

/** One proposal's vote summary in the aggregated response */
export type TallyProposalVoteSummaryEntry = {
  proposalId: string;
  governorAddress: string;
  voteSummary: TallyProposalVoteSummary;
};

/** The indexer's governor kinds */
export type IndexerGovernorType =
  | "CONSTITUTIONAL"
  | "NON_CONSTITUTIONAL"
  | "L1_VOTING";

/**
 * How far an executed proposal's timelock operations have got, as the indexer
 * derives it. The L1 voting governor only reaches the `L1_*`, `L2_RETRYABLE_*`
 * and `FULLY_EXECUTED` values.
 */
export type IndexerExecutionPhase =
  | "L2_TIMELOCK_PENDING"
  | "L2_TIMELOCK_EXECUTED"
  | "L1_CHALLENGE_PERIOD"
  | "L1_TIMELOCK_PENDING"
  | "L1_TIMELOCK_EXECUTED"
  | "L2_RETRYABLE_PENDING"
  | "FULLY_EXECUTED";

export type TallyProposalIndexEntry = {
  proposalId: string;
  governorAddress: string;
  /**
   * The remaining fields up to `executionCancelled` are optional because an
   * older indexer deployment does not serve them; an entry without them is an
   * Arbitrum One proposal.
   */
  governorType?: IndexerGovernorType | null;
  /** 42161 for the Arbitrum One governors; 1 (or local 1337) for L1 voting */
  chainId?: number | null;
  /**
   * L1 voting only (null elsewhere): votes wait for the snapshot lock, and
   * `snapshotBlock` is the locked block once this is true.
   */
  snapshotLocked?: boolean | null;
  executionPhase?: IndexerExecutionPhase | null;
  /** A timelock operation was cancelled: `executionPhase` is where it stopped */
  executionCancelled?: boolean;
  /** The governor's quorum at the snapshot, null until the indexer reads it */
  quorum?: string | null;
  snapshotBlock: number;
  state: string | null;
  proposer: string | null;
  description: string | null;
  /**
   * Transaction that emitted `ProposalCreated`, which is the only handle the
   * lifecycle tracker has on a proposal. Optional because an older indexer
   * deployment may not serve it; without it the table falls back to finding the
   * hash by scanning `ProposalCreated` logs over the recent window.
   */
  creationTxHash?: string | null;
};

/** Lifecycle stage kinds; the names match gov-tracker's `StageType` */
export type IndexerStageType =
  | "PROPOSAL_CREATED"
  | "VOTING_ACTIVE"
  | "PROPOSAL_QUEUED"
  | "L2_TIMELOCK"
  | "L2_TO_L1_MESSAGE"
  | "L1_TIMELOCK"
  | "RETRYABLE_EXECUTED"
  | "CREATE_ELECTION"
  | "NOMINEE_ELECTION"
  | "NOMINEE_VETTING"
  | "MEMBER_ELECTION";

/** How the indexer classifies a proposal's lifecycle */
export type IndexerProposalType = "core" | "treasury" | "l1" | "election";

export type IndexerStageStatus =
  | "COMPLETED"
  | "PENDING"
  | "NOT_STARTED"
  | "CANCELED";

/** One retryable ticket of a proposal's L1 timelock execution */
export type IndexerRetryableLeg = {
  executionKey: string | null;
  /** A retryable some other operation created; not counted toward done */
  foreign?: boolean;
  executed: boolean;
  /** Unix seconds */
  executedAt?: number | null;
  txHash: string | null;
  /** The ticket id to redeem; null when the indexer has not resolved it */
  ticketId?: string | null;
  /** Older indexer deployments do not report it */
  status?: IndexerRetryableStatus;
};

export type IndexerRetryableStatus =
  | "REDEEMED"
  | "REDEEMABLE"
  | "PENDING"
  | "EXPIRED"
  | "FOREIGN";

/** One call of a scheduled timelock operation; `value` is a decimal string */
export type IndexerTimelockCall = {
  target: string;
  value: string;
  data: string;
};

/** One L2-to-L1 message; the numbers are decimal strings */
export type IndexerL2ToL1Message = {
  position: string;
  l2TxHash: string | null;
  caller: string;
  destination: string;
  arbBlockNum: string;
  ethBlockNum: string;
  timestamp: string;
  callvalue: string;
  data: string;
};

/**
 * The per-stage `detail`, by stage type. Every field is optional because an
 * older indexer deployment serves fewer of them; numbers are decimal strings.
 */
export type IndexerStageDetail = {
  // VOTING_ACTIVE
  result?: string | null;
  snapshotLocked?: boolean | null;
  startBlock?: string | null;
  endBlock?: string | null;
  forVotes?: string | null;
  againstVotes?: string | null;
  abstainVotes?: string | null;
  quorum?: string | null;
  // L2_TIMELOCK, L1_TIMELOCK
  operationId?: string;
  calls?: number;
  scheduledTxHash?: string | null;
  predecessor?: string | null;
  /** Null when the indexer cannot recover it */
  salt?: string | null;
  timelockAddress?: string | null;
  chainId?: number | null;
  operations?: IndexerTimelockCall[];
  // L2_TO_L1_MESSAGE
  l1OperationId?: string | null;
  messages?: IndexerL2ToL1Message[];
  // RETRYABLE_EXECUTED
  legs?: IndexerRetryableLeg[];
  // Election stages
  cohort?: number | string | null;
  vettingEndBlock?: string | null;
  memberProposalId?: string | null;
  memberStartBlock?: string | null;
  memberEndBlock?: string | null;
  [key: string]: unknown;
};

export type IndexerProposalStage = {
  type: IndexerStageType;
  status: IndexerStageStatus;
  chain: "arb1" | "ethereum";
  /** Unix seconds */
  startedAt: number | null;
  /** Unix seconds */
  completedAt: number | null;
  /** Unix seconds at which a timelock operation becomes executable */
  etaAt: number | null;
  /** The transaction that completed the stage */
  txHash: string | null;
  detail: IndexerStageDetail | null;
};

/** `/api/tally/proposals/:governor/:proposalId/stages` */
export type IndexerProposalStages = {
  proposalId: string;
  governorAddress: string;
  governorType: IndexerGovernorType | string;
  executionPhase: IndexerExecutionPhase | null;
  executionCancelled: boolean;
  /** Older indexer deployments do not report it */
  proposalType?: IndexerProposalType;
  stages: IndexerProposalStage[];
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
  httpvfs: null;
};

export interface TallyDataClient {
  getDelegateList(
    minVotingPower?: string,
    limit?: number
  ): Promise<TallyDelegateListResult>;
  getDelegatesPage(
    params: DelegatePageParams
  ): Promise<TallyDelegateListResult>;
  getDelegateCount(
    params?: DelegateCountParams
  ): Promise<TallyDelegateCountResult>;
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
  getDelegateVotes(address: string): Promise<TallyDelegateVote[]>;
  getProposalVotes(
    proposalId: string,
    governorAddress: string
  ): Promise<TallyProposalVoter[]>;
  getProposalVoteSummary(
    proposalId: string,
    governorAddress: string
  ): Promise<TallyProposalVoteSummary>;
  getAllProposalVoteSummaries(): Promise<TallyProposalVoteSummaryEntry[]>;
  getProposalVotersPage(
    proposalId: string,
    governorAddress: string,
    support: TallyProposalVoteSupport,
    offset: number,
    limit: number
  ): Promise<TallyProposalVoter[]>;
  getProposalsIndex(): Promise<TallyProposalIndexEntry[]>;
  getProposalIndexEntry(
    proposalId: string,
    governorAddress: string
  ): Promise<TallyProposalIndexEntry | null>;
  getProposalStages(
    proposalId: string,
    governorAddress: string
  ): Promise<IndexerProposalStages | null>;
  getDelegateVotesWatermarkBlock(): Promise<number>;
  getStats(): Promise<TallyDataStats>;
}
