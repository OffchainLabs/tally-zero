"use client";

import {
  keepPreviousData,
  useQueries,
  useQuery,
  type QueryClient,
} from "@tanstack/react-query";
import { ethers } from "ethers";

import { useRpcSettings } from "@/hooks/use-rpc-settings";
import {
  getDelegateDisplayRecords,
  getDelegateVotesWatermarkBlock,
  getProposalIndexEntry,
  getProposalVoteSummary,
  getProposalVotersPage,
  type TallyProposalDelegateVote,
  type TallyProposalIndexEntry,
  type TallyProposalVoteSummary,
  type TallyProposalVoteSupport,
  type TallyProposalVoter,
} from "@/lib/delegate-data";
import { toError } from "@/lib/error-utils";
import { createRpcProvider } from "@/lib/rpc-utils";
import { VOTE_CAST_ABI } from "@/lib/vote-cast-abi";

const RPC_DELTA_CHUNK_SIZE = 10_000_000;
const QUERY_GC_TIME = 30 * 60 * 1000;

export const PROPOSAL_DELEGATE_VOTES_PAGE_SIZE = 20;

export type ProposalVoteSupportKey = "for" | "against" | "abstain";

export type ProposalVoter = TallyProposalVoter;

export type ProposalDelegateVotesResult = {
  for: ProposalVoter[];
  against: ProposalVoter[];
  abstain: ProposalVoter[];
  totals: {
    forWeight: string;
    againstWeight: string;
    abstainWeight: string;
    forCount: number;
    againstCount: number;
    abstainCount: number;
    totalCount: number;
  };
};

export type ProposalDelegateVotesState = {
  data: ProposalDelegateVotesResult | undefined;
  isLoading: boolean;
  error: Error | null;
  isSyncing: boolean;
  syncError: Error | null;
  supportLoading: Record<ProposalVoteSupportKey, boolean>;
  supportFetching: Record<ProposalVoteSupportKey, boolean>;
};

export const PROPOSAL_VOTE_SUPPORT_VALUES: Record<
  ProposalVoteSupportKey,
  TallyProposalVoteSupport
> = {
  against: 0,
  for: 1,
  abstain: 2,
};

const FINALIZED_PROPOSAL_STATES = new Set([
  "succeeded",
  "queued",
  "executed",
  "defeated",
  "canceled",
  "expired",
]);

const SUPPORT_KEYS = ["for", "against", "abstain"] as const;
const DEFAULT_VISIBLE_COUNTS: Record<ProposalVoteSupportKey, number> = {
  for: PROPOSAL_DELEGATE_VOTES_PAGE_SIZE,
  against: PROPOSAL_DELEGATE_VOTES_PAGE_SIZE,
  abstain: PROPOSAL_DELEGATE_VOTES_PAGE_SIZE,
};

function proposalDelegateVotesSummaryQueryKey(
  proposalId: string,
  governorAddress: string
) {
  return [
    "proposal-delegate-votes-summary",
    proposalId,
    governorAddress.toLowerCase(),
  ] as const;
}

function proposalDelegateVotesPageQueryKey({
  proposalId,
  governorAddress,
  support,
  limit,
}: {
  proposalId: string;
  governorAddress: string;
  support: ProposalVoteSupportKey;
  limit: number;
}) {
  return [
    "proposal-delegate-votes-page",
    proposalId,
    governorAddress.toLowerCase(),
    support,
    0,
    limit,
  ] as const;
}

function isSupportEnabled(
  enabledSupports: ReadonlySet<ProposalVoteSupportKey> | undefined,
  support: ProposalVoteSupportKey
): boolean {
  return !enabledSupports || enabledSupports.has(support);
}

function getVisibleCount(
  visibleCounts: Partial<Record<ProposalVoteSupportKey, number>> | undefined,
  support: ProposalVoteSupportKey
): number {
  return Math.max(
    0,
    Math.trunc(visibleCounts?.[support] ?? DEFAULT_VISIBLE_COUNTS[support])
  );
}

function hasFinalizedVotes(proposalState: string | undefined): boolean {
  return FINALIZED_PROPOSAL_STATES.has(proposalState?.toLowerCase() ?? "");
}

export function prefetchProposalDelegateVotesCache(
  queryClient: QueryClient,
  {
    proposalId,
    governorAddress,
    support = "for",
    limit = PROPOSAL_DELEGATE_VOTES_PAGE_SIZE,
  }: {
    proposalId: string;
    governorAddress: string;
    support?: ProposalVoteSupportKey;
    limit?: number;
  }
): void {
  Promise.all([
    queryClient.prefetchQuery({
      queryKey: [
        "proposal-index-entry",
        proposalId,
        governorAddress.toLowerCase(),
      ],
      queryFn: () => getProposalIndexEntry(proposalId, governorAddress),
      staleTime: Infinity,
      gcTime: QUERY_GC_TIME,
    }),
    queryClient.prefetchQuery({
      queryKey: proposalDelegateVotesSummaryQueryKey(
        proposalId,
        governorAddress
      ),
      queryFn: () => getProposalVoteSummary(proposalId, governorAddress),
      staleTime: Infinity,
      gcTime: QUERY_GC_TIME,
    }),
    queryClient.prefetchQuery({
      queryKey: proposalDelegateVotesPageQueryKey({
        proposalId,
        governorAddress,
        support,
        limit,
      }),
      queryFn: () =>
        getProposalVotersPage(
          proposalId,
          governorAddress,
          PROPOSAL_VOTE_SUPPORT_VALUES[support],
          0,
          limit
        ),
      staleTime: Infinity,
      gcTime: QUERY_GC_TIME,
    }),
  ]).catch(() => undefined);
}

async function fetchRpcDeltaVotesForProposal({
  l2Rpc,
  proposalId,
  governorAddress,
  fromBlock,
}: {
  l2Rpc: string;
  proposalId: string;
  governorAddress: string;
  fromBlock: number;
}): Promise<TallyProposalDelegateVote[]> {
  const provider = await createRpcProvider(l2Rpc);
  const currentBlock = await provider.getBlockNumber();
  const upperBound = currentBlock;

  if (fromBlock > upperBound) return [];

  const records: TallyProposalDelegateVote[] = [];
  const governorLower = governorAddress.toLowerCase();
  const contract = new ethers.Contract(
    governorAddress,
    VOTE_CAST_ABI,
    provider
  );
  const voteCastFilter = contract.filters.VoteCast();
  const voteCastWithParamsFilter = contract.filters.VoteCastWithParams();

  for (let from = fromBlock; from <= upperBound; from += RPC_DELTA_CHUNK_SIZE) {
    const to = Math.min(from + RPC_DELTA_CHUNK_SIZE - 1, upperBound);
    const [voteCastLogs, voteCastWithParamsLogs] = await Promise.all([
      contract.queryFilter(voteCastFilter, from, to),
      contract.queryFilter(voteCastWithParamsFilter, from, to),
    ]);

    for (const log of [...voteCastLogs, ...voteCastWithParamsLogs]) {
      const parsed = contract.interface.parseLog({
        topics: log.topics as string[],
        data: log.data,
      });
      const evtProposalId = ethers.BigNumber.from(
        parsed.args.proposalId
      ).toString();
      if (evtProposalId !== proposalId) continue;

      records.push({
        voter: (parsed.args.voter as string).toLowerCase(),
        proposalId: evtProposalId,
        governorAddress: governorLower,
        support: Number(parsed.args.support) as 0 | 1 | 2,
        weight: parsed.args.weight.toString(),
        blockNumber: log.blockNumber,
      });
    }
  }

  return records;
}

async function fetchRpcDeltaVotersForProposal({
  l2Rpc,
  proposalId,
  governorAddress,
}: {
  l2Rpc: string;
  proposalId: string;
  governorAddress: string;
}): Promise<ProposalVoter[]> {
  const watermarkBlock = await getDelegateVotesWatermarkBlock();
  const deltaVotes = await fetchRpcDeltaVotesForProposal({
    l2Rpc,
    proposalId,
    governorAddress,
    fromBlock: watermarkBlock + 1,
  });

  if (deltaVotes.length === 0) return [];

  const deltaDisplay = await getDelegateDisplayRecords(
    deltaVotes.map((v) => v.voter)
  );

  return deltaVotes
    .map((vote) => {
      const key = vote.voter.toLowerCase();
      const display = deltaDisplay.get(key) ?? {
        address: key,
        label: null,
        title: null,
        picture: null,
        profileUrl: null,
        source: "address" as const,
      };
      return { ...vote, display };
    })
    .sort(compareWeightDesc);
}

function compareWeightDesc(a: ProposalVoter, b: ProposalVoter): number {
  const aw = BigInt(a.weight);
  const bw = BigInt(b.weight);
  if (aw === bw) return 0;
  return aw > bw ? -1 : 1;
}

function addDecimalStrings(a: string, b: string): string {
  return (BigInt(a) + BigInt(b)).toString();
}

function getDeltaVotersBySupport(
  voters: readonly ProposalVoter[],
  support: ProposalVoteSupportKey
): ProposalVoter[] {
  const supportValue = PROPOSAL_VOTE_SUPPORT_VALUES[support];
  return voters.filter((voter) => voter.support === supportValue);
}

function mergeVotersForSupport({
  cachedVoters,
  deltaVoters,
  visibleCount,
}: {
  cachedVoters: readonly ProposalVoter[];
  deltaVoters: readonly ProposalVoter[];
  visibleCount: number;
}): ProposalVoter[] {
  if (deltaVoters.length === 0) return [...cachedVoters];

  const merged = new Map<string, ProposalVoter>();
  for (const voter of cachedVoters) {
    merged.set(voter.voter.toLowerCase(), voter);
  }
  for (const voter of deltaVoters) {
    merged.set(voter.voter.toLowerCase(), voter);
  }

  return Array.from(merged.values())
    .sort(compareWeightDesc)
    .slice(0, visibleCount);
}

function getDeltaSummary(
  deltaVoters: readonly ProposalVoter[],
  support: ProposalVoteSupportKey
) {
  const voters = getDeltaVotersBySupport(deltaVoters, support);
  return {
    count: voters.length,
    weight: voters
      .reduce((acc, voter) => acc + BigInt(voter.weight), BigInt(0))
      .toString(),
  };
}

function buildResult({
  summary,
  pageVoters,
  deltaVoters,
  visibleCounts,
}: {
  summary: TallyProposalVoteSummary;
  pageVoters: Record<ProposalVoteSupportKey, ProposalVoter[]>;
  deltaVoters: readonly ProposalVoter[];
  visibleCounts: Partial<Record<ProposalVoteSupportKey, number>> | undefined;
}): ProposalDelegateVotesResult {
  const bySupport = Object.fromEntries(
    SUPPORT_KEYS.map((support) => {
      const supportDelta = getDeltaVotersBySupport(deltaVoters, support);
      return [
        support,
        mergeVotersForSupport({
          cachedVoters: pageVoters[support],
          deltaVoters: supportDelta,
          visibleCount: getVisibleCount(visibleCounts, support),
        }),
      ];
    })
  ) as Record<ProposalVoteSupportKey, ProposalVoter[]>;

  const forDelta = getDeltaSummary(deltaVoters, "for");
  const againstDelta = getDeltaSummary(deltaVoters, "against");
  const abstainDelta = getDeltaSummary(deltaVoters, "abstain");

  return {
    for: bySupport.for,
    against: bySupport.against,
    abstain: bySupport.abstain,
    totals: {
      forWeight: addDecimalStrings(summary.for.weight, forDelta.weight),
      againstWeight: addDecimalStrings(
        summary.against.weight,
        againstDelta.weight
      ),
      abstainWeight: addDecimalStrings(
        summary.abstain.weight,
        abstainDelta.weight
      ),
      forCount: summary.for.voterCount + forDelta.count,
      againstCount: summary.against.voterCount + againstDelta.count,
      abstainCount: summary.abstain.voterCount + abstainDelta.count,
      totalCount:
        summary.totalCount +
        forDelta.count +
        againstDelta.count +
        abstainDelta.count,
    },
  };
}

export function useProposalDelegateVotes({
  proposalId,
  governorAddress,
  activeSupport = "for",
  visibleCounts,
  enabledSupports,
  enabled = true,
}: {
  proposalId: string;
  governorAddress: string;
  activeSupport?: ProposalVoteSupportKey;
  visibleCounts?: Partial<Record<ProposalVoteSupportKey, number>>;
  enabledSupports?: ReadonlySet<ProposalVoteSupportKey>;
  enabled?: boolean;
}): ProposalDelegateVotesState {
  const { l2Rpc, isHydrated } = useRpcSettings();
  const queryEnabled =
    enabled && isHydrated && !!proposalId && !!governorAddress;

  const summaryQuery = useQuery<TallyProposalVoteSummary, Error>({
    queryKey: proposalDelegateVotesSummaryQueryKey(proposalId, governorAddress),
    queryFn: () => getProposalVoteSummary(proposalId, governorAddress),
    enabled: queryEnabled,
    staleTime: Infinity,
    gcTime: QUERY_GC_TIME,
  });

  const proposalIndexQuery = useQuery<TallyProposalIndexEntry | null, Error>({
    queryKey: [
      "proposal-index-entry",
      proposalId,
      governorAddress.toLowerCase(),
    ],
    queryFn: () => getProposalIndexEntry(proposalId, governorAddress),
    enabled: queryEnabled,
    staleTime: Infinity,
    gcTime: QUERY_GC_TIME,
  });

  const pageQueries = useQueries({
    queries: SUPPORT_KEYS.map((support) => {
      const limit = getVisibleCount(visibleCounts, support);
      return {
        queryKey: proposalDelegateVotesPageQueryKey({
          proposalId,
          governorAddress,
          support,
          limit,
        }),
        queryFn: () =>
          getProposalVotersPage(
            proposalId,
            governorAddress,
            PROPOSAL_VOTE_SUPPORT_VALUES[support],
            0,
            limit
          ),
        enabled:
          queryEnabled &&
          limit > 0 &&
          isSupportEnabled(enabledSupports, support),
        staleTime: Infinity,
        gcTime: QUERY_GC_TIME,
        placeholderData: keepPreviousData,
      };
    }),
  });

  const sqliteProposalState = proposalIndexQuery.data?.state ?? undefined;
  const shouldFetchRpcDelta =
    queryEnabled &&
    !proposalIndexQuery.isLoading &&
    !hasFinalizedVotes(sqliteProposalState);

  const rpcDeltaQuery = useQuery<ProposalVoter[], Error>({
    queryKey: [
      "proposal-delegate-votes-rpc-delta",
      proposalId,
      governorAddress.toLowerCase(),
      sqliteProposalState?.toLowerCase() ?? null,
      l2Rpc,
    ],
    queryFn: async () => {
      try {
        return await fetchRpcDeltaVotersForProposal({
          l2Rpc,
          proposalId,
          governorAddress,
        });
      } catch (err) {
        throw toError(err);
      }
    },
    enabled: shouldFetchRpcDelta,
    staleTime: 60 * 1000,
    gcTime: QUERY_GC_TIME,
  });

  const pageVoters = Object.fromEntries(
    SUPPORT_KEYS.map((support, index) => [
      support,
      (pageQueries[index].data ?? []) as ProposalVoter[],
    ])
  ) as Record<ProposalVoteSupportKey, ProposalVoter[]>;
  const supportLoading = Object.fromEntries(
    SUPPORT_KEYS.map((support, index) => [
      support,
      pageQueries[index].isLoading && !pageQueries[index].data,
    ])
  ) as Record<ProposalVoteSupportKey, boolean>;
  const supportFetching = Object.fromEntries(
    SUPPORT_KEYS.map((support, index) => [
      support,
      pageQueries[index].isFetching,
    ])
  ) as Record<ProposalVoteSupportKey, boolean>;
  const activeSupportIndex = SUPPORT_KEYS.indexOf(activeSupport);
  const activePageQuery = pageQueries[activeSupportIndex];
  const activePageLoading =
    isSupportEnabled(enabledSupports, activeSupport) &&
    activePageQuery.isLoading &&
    !activePageQuery.data;
  const data = summaryQuery.data
    ? buildResult({
        summary: summaryQuery.data,
        pageVoters,
        deltaVoters: shouldFetchRpcDelta ? (rpcDeltaQuery.data ?? []) : [],
        visibleCounts,
      })
    : undefined;

  return {
    data,
    isLoading: summaryQuery.isLoading || activePageLoading,
    error: summaryQuery.error ?? activePageQuery.error ?? null,
    isSyncing: shouldFetchRpcDelta && rpcDeltaQuery.isFetching,
    syncError: shouldFetchRpcDelta ? (rpcDeltaQuery.error ?? null) : null,
    supportLoading,
    supportFetching,
  };
}
