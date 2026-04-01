import type {
  ElectionProposalStatus,
  ElectionStatus,
  SerializableMemberDetails,
  SerializableNomineeDetails,
} from "@gzeoneth/gov-tracker";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NomineeElectionDetails = SerializableNomineeDetails | null;
export type MemberElectionDetails = SerializableMemberDetails | null;
export type L2Provider = InstanceType<
  typeof import("ethers").providers.JsonRpcProvider
>;

/** Result from loading a single election's live data. */
export interface LiveElectionResult {
  index: number;
  status: ElectionProposalStatus;
  nominee: NomineeElectionDetails;
  member: MemberElectionDetails;
}

/** Collected cache data returned by loadCachedElections. */
export interface CachedElectionData {
  elections: ElectionProposalStatus[];
  nomineeDetails: Record<number, NomineeElectionDetails>;
  memberDetails: Record<number, MemberElectionDetails>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Election phases in forward-only progression order.
 * Once an election reaches a phase, it must never regress to an earlier one.
 */
export const PHASE_RANK: Record<string, number> = {
  NOT_STARTED: 0,
  CONTENDER_SUBMISSION: 1,
  NOMINEE_SELECTION: 2,
  VETTING_PERIOD: 3,
  MEMBER_ELECTION: 4,
  PENDING_EXECUTION: 5,
  COMPLETED: 6,
};

/** Shape of the data returned by the main election query. */
export interface ElectionQueryData {
  status: ElectionStatus | null;
  elections: ElectionProposalStatus[];
  nomineeDetailsMap: Record<number, NomineeElectionDetails>;
  memberDetailsMap: Record<number, MemberElectionDetails>;
  latestL1Block?: number;
}

export const DEFAULT_NOMINEE_GOVERNOR =
  "0x8a1cDA8dee421cD06023470608605934c16A05a0";

// ---------------------------------------------------------------------------
// Hook interfaces
// ---------------------------------------------------------------------------

export interface UseElectionStatusOptions {
  enabled?: boolean;
  l2RpcUrl?: string;
  l1RpcUrl?: string;
  l1ChunkSize?: number;
  l2ChunkSize?: number;

  selectedElectionIndex?: number | null;
  nomineeGovernorAddress?: string;
  memberGovernorAddress?: string;
  chainId?: number;
}

export interface UseElectionStatusResult {
  status: ElectionStatus | null;
  allElections: ElectionProposalStatus[];
  activeElections: ElectionProposalStatus[];
  selectedElection: ElectionProposalStatus | null;
  nomineeDetails: NomineeElectionDetails;
  memberDetails: MemberElectionDetails;
  nomineeDetailsMap: Record<number, NomineeElectionDetails>;
  memberDetailsMap: Record<number, MemberElectionDetails>;
  latestL1Block: number | undefined;
  isLoading: boolean;
  error: Error | null;
  refresh: () => void;
  selectElection: (index: number | null) => void;
}
