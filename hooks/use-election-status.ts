"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  checkElectionStatus,
  createTracker,
  getAllElectionStatuses,
  getElectionCount,
  getMemberElectionDetails,
  getNomineeElectionDetails,
  MAINNET_ELECTION_CONFIG,
  serializeMemberDetails,
  serializeNomineeDetails,
  type ElectionConfig,
  type ElectionProposalStatus,
  type ChunkingConfig as GovTrackerChunkingConfig,
} from "@gzeoneth/gov-tracker";
import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";

import { initializeBundledCache } from "@/lib/bundled-cache-loader";
import { debug } from "@/lib/debug";
import {
  enrichContenderVotes,
  fetchLiveElection,
  fetchOverallStatus,
  loadCachedElections,
} from "@/lib/election-status/fetchers";
import {
  correctVettingPeriod,
  isCorsOrNetworkError,
  mergeResults,
  preventPhaseRegression,
} from "@/lib/election-status/helpers";
import type {
  CachedElectionData,
  ElectionQueryData,
  MemberElectionDetails,
  NomineeElectionDetails,
  UseElectionStatusOptions,
  UseElectionStatusResult,
} from "@/lib/election-status/types";
import { getCacheAdapter } from "@/lib/gov-tracker-cache";
import { batchQueryWithRateLimit, getOrCreateProvider } from "@/lib/rpc-utils";
import {
  ARBITRUM_RPC_URL,
  ETHEREUM_RPC_URL,
} from "@config/arbitrum-governance";
import {
  createPublicClient,
  http,
  type Abi,
  type AbiEvent,
  type PublicClient,
} from "viem";
import { arbitrum } from "viem/chains";

export type { UseElectionStatusOptions, UseElectionStatusResult };

// ---------------------------------------------------------------------------
// Query key factory
// ---------------------------------------------------------------------------

export const electionKeys = {
  all: ["elections"] as const,
  data: (
    l2Url: string,
    l1Url: string,
    overrides?: { nominee: string; member: string }
  ) => ["elections", "data", l2Url, l1Url, overrides ?? "default"] as const,
  track: (l2Url: string, l1Url: string, index: number) =>
    ["elections", "track", l2Url, l1Url, index] as const,
};

const EMPTY_NOMINEE_MAP: Record<number, NomineeElectionDetails> = {};
const EMPTY_MEMBER_MAP: Record<number, MemberElectionDetails> = {};
const VOTING_PHASE_POLL_INTERVAL = 5 * 60 * 1000; // 5 minutes
const FALLBACK_EXECUTION_SEARCH_BLOCKS = 10_000_000;
// Conservative upper bound on Arbitrum L2 blocks per L1 block. Steady-state is
// ~48 (250ms L2 vs 12s L1); over-estimating widens the search range backwards,
// which is the safe direction — under-estimating could skip past the snapshot.
const L2_BLOCKS_PER_L1_BLOCK = 60;
// Maximum L2 ProposalExecuted log queries to run concurrently when hydrating
// historical SC elections. Each query can fan out further via the chunked
// provider, so keep concurrency tight to avoid rate limits.
const HYDRATION_CONCURRENCY = 3;
// Minimal ABI for proposalSnapshot — viem's readContract decodes uint256
// straight into a bigint, so the call site never touches ethers BigNumber.
const PROPOSAL_SNAPSHOT_ABI = [
  {
    type: "function",
    name: "proposalSnapshot",
    stateMutability: "view",
    inputs: [{ name: "proposalId", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const satisfies Abi;
// proposalId is not indexed, so we filter client-side after fetching. Using
// the event ABI lets viem compute the topic and decode `args.proposalId`
// without us having to keccak256 or BigInt the raw log data.
const PROPOSAL_EXECUTED_EVENT = {
  type: "event",
  name: "ProposalExecuted",
  inputs: [{ name: "proposalId", type: "uint256", indexed: false }],
} as const satisfies AbiEvent;

// ---------------------------------------------------------------------------
// Non-hook helpers
// ---------------------------------------------------------------------------

/**
 * Get the block number as seen by Solidity's `block.number` on the L2 chain.
 * On Arbitrum, `block.number` returns the **L1 block number**, which is the
 * same clock the Governor contract uses for proposalDeadline and
 * fullWeightVotingDeadline. We call Multicall3's `getBlockNumber()` via
 * eth_call to get this value, since the JSON-RPC `eth_blockNumber` and
 * `eth_getBlockByNumber` return the L2 block number instead.
 */
const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11";
const GET_BLOCK_NUMBER_SELECTOR = "0x42cbb15c"; // getBlockNumber()

async function getL1BlockFromL2(
  l2Provider: ReturnType<typeof getOrCreateProvider>
): Promise<number | undefined> {
  try {
    const result = await l2Provider.call({
      to: MULTICALL3,
      data: GET_BLOCK_NUMBER_SELECTOR,
    });
    const blockNum = Number(BigInt(result));
    return blockNum > 0 ? blockNum : undefined;
  } catch {
    return undefined;
  }
}

async function createTrackerInstance(
  l2Url: string,
  l1Url: string,
  chunkingConfig: GovTrackerChunkingConfig | undefined,
  skipBundledCache: boolean
) {
  const cache = getCacheAdapter();
  if (!skipBundledCache) {
    await initializeBundledCache(cache);
  }
  const l2Provider = getOrCreateProvider(l2Url);
  const l1Provider = getOrCreateProvider(l1Url);
  const tracker = createTracker({
    l2Provider,
    l1Provider,
    cache,
    chunkingConfig,
  });
  return { tracker, l2Provider, l1Provider };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useElectionStatus({
  enabled = true,
  l2RpcUrl,
  l1RpcUrl,
  l1ChunkSize,
  l2ChunkSize,

  selectedElectionIndex: initialSelectedIndex = null,
  nomineeGovernorAddress,
  memberGovernorAddress,
  chainId = 42161,
}: UseElectionStatusOptions = {}): UseElectionStatusResult {
  const queryClient = useQueryClient();
  const [selectedIndex, setSelectedIndex] = useState<number | null>(
    initialSelectedIndex
  );
  const shownErrorToastRef = useRef(false);

  const l2Url = l2RpcUrl || ARBITRUM_RPC_URL;
  const l1Url = l1RpcUrl || ETHEREUM_RPC_URL;
  const isCustomL2Rpc = !!l2RpcUrl && l2RpcUrl !== ARBITRUM_RPC_URL;

  const hasAddressOverrides = !!(
    nomineeGovernorAddress && memberGovernorAddress
  );

  const chunkingConfig = useMemo<GovTrackerChunkingConfig | undefined>(() => {
    if (!l1ChunkSize && !l2ChunkSize) return undefined;
    return {
      l1ChunkSize: l1ChunkSize ?? 10000,
      l2ChunkSize: l2ChunkSize ?? 10000000,
      delayBetweenChunks: 100,
    };
  }, [l1ChunkSize, l2ChunkSize]);

  const electionConfig = useMemo<ElectionConfig | undefined>(() => {
    if (!nomineeGovernorAddress || !memberGovernorAddress) return undefined;
    return {
      nomineeGovernorAddress: nomineeGovernorAddress as `0x${string}`,
      memberGovernorAddress: memberGovernorAddress as `0x${string}`,
      chainId,
    };
  }, [nomineeGovernorAddress, memberGovernorAddress, chainId]);

  const overridesKey = useMemo(
    () =>
      electionConfig
        ? {
            nominee: electionConfig.nomineeGovernorAddress,
            member: electionConfig.memberGovernorAddress,
          }
        : undefined,
    [electionConfig]
  );

  // Reset CORS toast flag when RPC URLs change
  useEffect(() => {
    shownErrorToastRef.current = false;
  }, [l2Url, l1Url]);

  // ---------------------------------
  // Seed cache on mount (instant first render from bundled cache)
  // ---------------------------------

  const queryKey = electionKeys.data(l2Url, l1Url, overridesKey);

  useEffect(() => {
    if (hasAddressOverrides || isCustomL2Rpc || !enabled) return;
    if (queryClient.getQueryData(queryKey)) return;

    let cancelled = false;
    (async () => {
      try {
        const { tracker } = await createTrackerInstance(
          l2Url,
          l1Url,
          chunkingConfig,
          false
        );
        const cached = await loadCachedElections(tracker);
        if (cancelled || cached.elections.length === 0) return;
        // Only seed if the main query hasn't resolved yet
        if (queryClient.getQueryData(queryKey)) return;
        const sorted = [...cached.elections].sort(
          (a, b) => a.electionIndex - b.electionIndex
        );
        queryClient.setQueryData<ElectionQueryData>(queryKey, {
          status: null,
          elections: preventPhaseRegression(sorted),
          nomineeDetailsMap: cached.nomineeDetails,
          memberDetailsMap: cached.memberDetails,
        });
      } catch {
        // Cache seeding is best-effort
      }
    })();
    return () => {
      cancelled = true;
    };
    // Run once on mount (stable deps)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------------------------
  // Main query
  // ---------------------------------

  const {
    data,
    isFetching,
    error: queryError,
    refetch,
  } = useQuery<ElectionQueryData, Error>({
    queryKey,
    queryFn: async (): Promise<ElectionQueryData> => {
      if (hasAddressOverrides && electionConfig) {
        try {
          return await fetchWithOverrides(l2Url, l1Url, electionConfig);
        } catch (overrideErr) {
          debug.app(
            "Override fetch failed, falling back to default: %O",
            overrideErr
          );
          // Fall through to default path
        }
      }
      const prevData = queryClient.getQueryData<ElectionQueryData>(queryKey);
      return fetchDefault(
        l2Url,
        l1Url,
        chunkingConfig,
        isCustomL2Rpc,
        prevData
      );
    },
    enabled,
    placeholderData: keepPreviousData,
    staleTime: VOTING_PHASE_POLL_INTERVAL,
    gcTime: 5 * 60 * 1000,
    retry: 1,
    refetchOnWindowFocus: "always",
    refetchInterval: (query) => {
      const currentData = query.state.data;
      if (!currentData) return false;

      const active = currentData.elections.filter(
        (e) => e.phase !== "COMPLETED"
      );
      const selected =
        selectedIndex !== null
          ? currentData.elections.find((e) => e.electionIndex === selectedIndex)
          : (active[0] ??
            currentData.elections[currentData.elections.length - 1]);

      if (
        selected?.phase === "NOMINEE_SELECTION" ||
        selected?.phase === "MEMBER_ELECTION"
      ) {
        return VOTING_PHASE_POLL_INTERVAL;
      }

      return false;
    },
  });

  // ---------------------------------
  // On-demand election tracking
  // ---------------------------------

  const shouldTrackElection =
    enabled &&
    !!data &&
    selectedIndex !== null &&
    !data.elections.some((e) => e.electionIndex === selectedIndex);

  const { data: trackedElection, isFetching: isTrackingElection } = useQuery<
    ElectionProposalStatus | null,
    Error
  >({
    queryKey: electionKeys.track(l2Url, l1Url, selectedIndex ?? -1),
    queryFn: async () => {
      const { tracker } = await createTrackerInstance(
        l2Url,
        l1Url,
        chunkingConfig,
        isCustomL2Rpc
      );
      debug.app("On-demand tracking election %d", selectedIndex);
      return (await tracker.trackElection(selectedIndex!)) ?? null;
    },
    enabled: shouldTrackElection,
    staleTime: Infinity,
    retry: false,
  });

  // Merge tracked election into main query data
  useEffect(() => {
    if (!trackedElection || selectedIndex === null) return;
    const mainKey = electionKeys.data(l2Url, l1Url, overridesKey);
    const current = queryClient.getQueryData<ElectionQueryData>(mainKey);
    if (!current) return;
    if (current.elections.some((e) => e.electionIndex === selectedIndex))
      return;

    let cancelled = false;
    (async () => {
      try {
        const { tracker } = await createTrackerInstance(
          l2Url,
          l1Url,
          chunkingConfig,
          isCustomL2Rpc
        );
        const checkpoint = await tracker.getElectionCheckpoint(selectedIndex);
        if (cancelled) return;

        queryClient.setQueryData<ElectionQueryData>(mainKey, (prev) => {
          if (!prev) return prev;
          if (prev.elections.some((e) => e.electionIndex === selectedIndex))
            return prev;
          const updated = [...prev.elections, trackedElection];
          updated.sort((a, b) => a.electionIndex - b.electionIndex);

          debug.app(
            "Successfully tracked election %d: %s (details cached: nominee=%s, member=%s)",
            selectedIndex,
            trackedElection.phase,
            !!checkpoint?.nomineeDetails,
            !!checkpoint?.memberDetails
          );

          return {
            ...prev,
            elections: preventPhaseRegression(updated),
            nomineeDetailsMap: {
              ...prev.nomineeDetailsMap,
              ...(checkpoint?.nomineeDetails
                ? { [selectedIndex]: checkpoint.nomineeDetails }
                : {}),
            },
            memberDetailsMap: {
              ...prev.memberDetailsMap,
              ...(checkpoint?.memberDetails
                ? { [selectedIndex]: checkpoint.memberDetails }
                : {}),
            },
          };
        });
      } catch (err) {
        debug.app(
          "Failed to load checkpoint for tracked election %d: %O",
          selectedIndex,
          err
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    trackedElection,
    selectedIndex,
    l2Url,
    l1Url,
    overridesKey,
    chunkingConfig,
    isCustomL2Rpc,
    queryClient,
  ]);

  // ---------------------------------
  // CORS error toast
  // ---------------------------------

  useEffect(() => {
    if (!queryError || data) return;
    if (!(queryError instanceof Error)) return;
    if (!isCorsOrNetworkError(queryError)) return;
    if (shownErrorToastRef.current) return;

    shownErrorToastRef.current = true;
    toast.error("Failed to load elections", {
      description:
        "The RPC endpoint may have CORS issues. Try configuring a different RPC URL in Settings.",
      duration: 10000,
      action: {
        label: "Settings",
        onClick: () => {
          document
            .querySelector<HTMLButtonElement>('[aria-label="Settings"]')
            ?.click();
        },
      },
    });
  }, [queryError, data]);

  // ---------------------------------
  // Derived values
  // ---------------------------------

  const allElections = useMemo(() => data?.elections ?? [], [data?.elections]);
  const nomineeDetailsMap = data?.nomineeDetailsMap ?? EMPTY_NOMINEE_MAP;
  const memberDetailsMap = data?.memberDetailsMap ?? EMPTY_MEMBER_MAP;

  const activeElections = useMemo(
    () => allElections.filter((e) => e.phase !== "COMPLETED"),
    [allElections]
  );

  const selectedElection = useMemo(() => {
    if (selectedIndex === null) {
      return (
        activeElections[0] ?? allElections[allElections.length - 1] ?? null
      );
    }
    return allElections.find((e) => e.electionIndex === selectedIndex) ?? null;
  }, [allElections, activeElections, selectedIndex]);

  const nomineeDetails = selectedElection
    ? (nomineeDetailsMap[selectedElection.electionIndex] ?? null)
    : null;
  const memberDetails = selectedElection
    ? (memberDetailsMap[selectedElection.electionIndex] ?? null)
    : null;

  // Error is only exposed when there's no data yet (initial load failure)
  const error = !data && queryError ? queryError : null;
  const isLoading = (!data && isFetching) || isTrackingElection;

  return {
    status: data?.status ?? null,
    allElections,
    activeElections,
    selectedElection,
    nomineeDetails,
    memberDetails,
    nomineeDetailsMap,
    memberDetailsMap,
    latestL1Block: data?.latestL1Block,
    isLoading,
    isRefreshing: !!data && isFetching,
    error,
    refresh: refetch,
    selectElection: setSelectedIndex,
  };
}

// ---------------------------------------------------------------------------
// Fetch functions (extracted from hook for clarity)
// ---------------------------------------------------------------------------

async function fetchDefault(
  l2Url: string,
  l1Url: string,
  chunkingConfig: GovTrackerChunkingConfig | undefined,
  isCustomL2Rpc: boolean,
  previousData?: ElectionQueryData
): Promise<ElectionQueryData> {
  const { tracker, l2Provider, l1Provider } = await createTrackerInstance(
    l2Url,
    l1Url,
    chunkingConfig,
    isCustomL2Rpc
  );

  debug.app("Fetching SC election status... (customRpc=%s)", isCustomL2Rpc);

  let cached: CachedElectionData = {
    elections: [],
    nomineeDetails: {},
    memberDetails: {},
  };

  if (!isCustomL2Rpc) {
    cached = await loadCachedElections(tracker);
  }

  // Carry forward completed elections from previous fetch to skip refetching
  if (previousData) {
    for (const e of previousData.elections) {
      if (e.phase !== "COMPLETED") continue;
      if (cached.elections.some((c) => c.electionIndex === e.electionIndex))
        continue;
      cached.elections.push(e);
      const nd = previousData.nomineeDetailsMap[e.electionIndex];
      if (nd) cached.nomineeDetails[e.electionIndex] = nd;
      const md = previousData.memberDetailsMap[e.electionIndex];
      if (md) cached.memberDetails[e.electionIndex] = md;
    }
  }

  const electionCount = await getElectionCount(l2Provider);
  debug.app("Election count: %d", electionCount);

  const cachedPhaseByIndex = new Map(
    cached.elections.map((e) => [e.electionIndex, e.phase])
  );
  const completedIndices = new Set(
    cached.elections
      .filter(
        (e) =>
          e.phase === "COMPLETED" &&
          // Completed cached elections without execution txs still need either
          // a proposal ID for direct event lookup or a fresh live status fetch.
          (hasElectionTimelockTx(e) || e.memberProposalId)
      )
      .map((e) => e.electionIndex)
  );
  const indicesToFetch = Array.from(
    { length: electionCount },
    (_, i) => i
  ).filter((i) => !completedIndices.has(i));

  const [liveResults, status, latestL1Block] = await Promise.all([
    Promise.all(
      indicesToFetch.map((i) =>
        fetchLiveElection(
          i,
          l2Provider,
          cachedPhaseByIndex.get(i),
          cached.nomineeDetails[i] ?? null,
          cached.memberDetails[i] ?? null
        )
      )
    ),
    fetchOverallStatus(l2Provider, l1Provider),
    getL1BlockFromL2(l2Provider),
  ]);

  const merged = mergeResults(cached, liveResults);
  // First pass: correct phases before hydration so we don't try to hydrate
  // elections whose live phase has been rolled back to a pre-execution state.
  merged.elections = preventPhaseRegression(merged.elections);
  // getElectionStatus() is lightweight and does not include stage tx hashes.
  // Newly executed elections only need the member execute tx for timelock links.
  // Use a viem PublicClient with manual chunking so wide ProposalExecuted log
  // queries don't trip free-tier RPC range limits.
  const l2ChunkSize = chunkingConfig?.l2ChunkSize ?? 10_000_000;
  const l2Client = createL2PublicClient(l2Url);
  await hydrateMissingElectionExecutionTxs(
    l2Provider,
    l2Client,
    l2ChunkSize,
    merged
  );

  return {
    status,
    // Second pass: hydration mutates election.stages, which can in turn lower
    // the inferred phase, so re-apply the no-regression rule.
    elections: preventPhaseRegression(merged.elections),
    nomineeDetailsMap: merged.nomineeDetails,
    memberDetailsMap: merged.memberDetails,
    latestL1Block,
  };
}

function createL2PublicClient(l2Url: string): PublicClient {
  return createPublicClient({
    chain: arbitrum,
    transport: http(l2Url, { retryCount: 2, retryDelay: 1000 }),
  });
}

function hasElectionTimelockTx(election: ElectionProposalStatus): boolean {
  const l2TimelockStage = election.stages?.find(
    (stage) => stage.type === "L2_TIMELOCK"
  );
  const memberElectionStage = election.stages?.find(
    (stage) => stage.type === "MEMBER_ELECTION"
  );

  return Boolean(
    election.memberExecuteTxHash ||
    l2TimelockStage?.transactions?.length ||
    memberElectionStage?.transactions?.some(
      (tx) => tx.description === "executed"
    )
  );
}

function needsElectionExecutionTxTracking(
  election: ElectionProposalStatus
): boolean {
  return (
    (election.phase === "PENDING_EXECUTION" ||
      election.phase === "COMPLETED") &&
    !hasElectionTimelockTx(election) &&
    // No memberProposalId means findMemberExecuteTx has nothing to match
    // against, so the hydration would no-op. Skip the slot entirely.
    !!election.memberProposalId
  );
}

async function hydrateMissingElectionExecutionTxs(
  l2Provider: ReturnType<typeof getOrCreateProvider>,
  l2Client: PublicClient,
  l2ChunkSize: number,
  data: CachedElectionData
): Promise<void> {
  const missingExecutionTxElections = data.elections.filter(
    needsElectionExecutionTxTracking
  );
  if (missingExecutionTxElections.length === 0) return;

  debug.app(
    "Hydrating %d election(s) missing execution tx data",
    missingExecutionTxElections.length
  );

  const hydrationQueries = missingExecutionTxElections.map(
    (election) => async () => {
      try {
        return await withFallbackMemberExecuteTx(
          l2Provider,
          l2Client,
          l2ChunkSize,
          election
        );
      } catch (err) {
        debug.app(
          "Failed to hydrate election %d execution tx data: %O",
          election.electionIndex,
          err
        );
        return null;
      }
    }
  );

  // Bounded concurrency: each hydration may fan out further via chunked
  // getLogs, so keep concurrent in-flight queries small.
  const hydratedResults = await batchQueryWithRateLimit(
    hydrationQueries,
    HYDRATION_CONCURRENCY,
    0
  );

  for (const status of hydratedResults) {
    if (!status) continue;

    const existingIdx = data.elections.findIndex(
      (election) => election.electionIndex === status.electionIndex
    );
    if (existingIdx === -1) continue;

    data.elections[existingIdx] = {
      ...data.elections[existingIdx],
      ...status,
    };
  }
}

async function withFallbackMemberExecuteTx(
  l2Provider: ReturnType<typeof getOrCreateProvider>,
  l2Client: PublicClient,
  l2ChunkSize: number,
  election: ElectionProposalStatus
): Promise<ElectionProposalStatus> {
  if (!election.memberProposalId) return election;

  const executeTx = await findMemberExecuteTx(
    l2Provider,
    l2Client,
    l2ChunkSize,
    election
  ).catch((err) => {
    debug.app(
      "Failed fallback member execute tx lookup for election %d: %O",
      election.electionIndex,
      err
    );
    return null;
  });

  if (!executeTx) return election;

  return {
    ...election,
    memberExecuteTxHash: executeTx.hash,
    stages: addMemberExecuteTxToStages(election, executeTx),
  };
}

function addMemberExecuteTxToStages(
  election: ElectionProposalStatus,
  tx: { hash: string; blockNumber: number }
): ElectionProposalStatus["stages"] {
  if (!election.stages) return election.stages;

  return election.stages.map((stage) => {
    if (stage.type !== "MEMBER_ELECTION") return stage;
    if (stage.transactions?.some((stageTx) => stageTx.hash === tx.hash)) {
      return stage;
    }

    return {
      ...stage,
      transactions: [
        ...(stage.transactions ?? []),
        {
          hash: tx.hash,
          blockNumber: tx.blockNumber,
          chain: "arb1",
          chainId: MAINNET_ELECTION_CONFIG.chainId,
          description: "executed",
        },
      ],
    };
  });
}

export function getMemberExecuteSearchStartBlock(
  election: ElectionProposalStatus,
  currentBlock: number,
  proposalSnapshotL2Block?: number | null
): number {
  const stageTxBlocks =
    election.stages?.flatMap(
      (stage) =>
        stage.transactions
          ?.map((tx) => tx.blockNumber)
          .filter((blockNumber): blockNumber is number => !!blockNumber) ?? []
    ) ?? [];

  const latestKnownStageBlock =
    stageTxBlocks.length > 0 ? Math.max(...stageTxBlocks) : null;

  // Prefer the most precise lower bound available, in this order:
  //   1. The latest block from already-tracked stage txs (we know the execute
  //      tx happened at or after the most recent stage).
  //   2. The L2 block estimate at proposalSnapshot (cheap on-chain read,
  //      always older than the execute tx).
  //   3. The fixed FALLBACK window, as a last resort.
  const candidate =
    latestKnownStageBlock ??
    proposalSnapshotL2Block ??
    currentBlock - FALLBACK_EXECUTION_SEARCH_BLOCKS;

  return Math.max(0, candidate);
}

/**
 * Estimate the L2 block at proposal creation.
 *
 * `proposalSnapshot(id)` on an Arbitrum L2 governor returns the **L1 Ethereum**
 * block number used for vote snapshotting (Solidity's `block.number` resolves
 * to the L1 block on Arbitrum). We convert that into an approximate L2 block
 * via the steady-state L2/L1 block ratio. Over-estimating the ratio is the
 * safe direction — the result is used as a `getLogs` lower bound, so a wider
 * range only means slightly more chunks, never a missed log.
 *
 * The L1-block lookup still goes through the ethers L2 provider because
 * `getL1BlockFromL2` predates this file's viem migration; the snapshot read
 * and current L2 block come from the viem `PublicClient`.
 */
async function getProposalSnapshotL2Block(
  l2Provider: ReturnType<typeof getOrCreateProvider>,
  l2Client: PublicClient,
  memberProposalId: string
): Promise<number | null> {
  try {
    const [snapshotL1Block, currentL1Block, currentL2Block] = await Promise.all(
      [
        l2Client.readContract({
          address:
            MAINNET_ELECTION_CONFIG.memberGovernorAddress as `0x${string}`,
          abi: PROPOSAL_SNAPSHOT_ABI,
          functionName: "proposalSnapshot",
          args: [BigInt(memberProposalId)],
        }),
        getL1BlockFromL2(l2Provider),
        l2Client.getBlockNumber(),
      ]
    );

    if (!currentL1Block) return null;
    const snapshotL1 = Number(snapshotL1Block);
    if (snapshotL1 <= 0 || snapshotL1 >= currentL1Block) return null;

    const l1ElapsedBlocks = currentL1Block - snapshotL1;
    const l2ElapsedBlocks = l1ElapsedBlocks * L2_BLOCKS_PER_L1_BLOCK;
    return Math.max(0, Number(currentL2Block) - l2ElapsedBlocks);
  } catch (err) {
    debug.app("proposalSnapshot lookup failed: %O", err);
    return null;
  }
}

async function findMemberExecuteTx(
  l2Provider: ReturnType<typeof getOrCreateProvider>,
  l2Client: PublicClient,
  l2ChunkSize: number,
  election: ElectionProposalStatus
): Promise<{ hash: string; blockNumber: number } | null> {
  if (!election.memberProposalId) return null;

  const [currentBlockBig, snapshotL2Block] = await Promise.all([
    l2Client.getBlockNumber(),
    getProposalSnapshotL2Block(l2Provider, l2Client, election.memberProposalId),
  ]);
  const currentBlock = Number(currentBlockBig);
  const fromBlock = getMemberExecuteSearchStartBlock(
    election,
    currentBlock,
    snapshotL2Block
  );
  const expectedProposalId = BigInt(election.memberProposalId);

  const memberGovernor =
    MAINNET_ELECTION_CONFIG.memberGovernorAddress as `0x${string}`;
  // viem `getLogs` doesn't auto-chunk like the wrapped ethers provider, so
  // walk the range in chunks ourselves to respect free-tier RPC limits.
  const chunkSize = Math.max(1, Math.floor(l2ChunkSize));

  for (let from = fromBlock; from <= currentBlock; from += chunkSize) {
    const to = Math.min(from + chunkSize - 1, currentBlock);
    const logs = await l2Client.getLogs({
      address: memberGovernor,
      event: PROPOSAL_EXECUTED_EVENT,
      fromBlock: BigInt(from),
      toBlock: BigInt(to),
    });

    for (const log of logs) {
      if (log.args.proposalId === expectedProposalId) {
        return {
          hash: log.transactionHash,
          blockNumber: Number(log.blockNumber),
        };
      }
    }
  }

  return null;
}

async function fetchWithOverrides(
  l2Url: string,
  l1Url: string,
  electionConfig: ElectionConfig
): Promise<ElectionQueryData> {
  const l2Provider = getOrCreateProvider(l2Url);
  const l1Provider = getOrCreateProvider(l1Url);

  debug.app("Fetching election data with address overrides...");

  const elections = await getAllElectionStatuses(l2Provider, electionConfig);

  debug.app("Fetched %d elections via override config", elections.length);

  let status = null;
  try {
    status = await checkElectionStatus(
      l2Provider,
      l1Provider,
      electionConfig.nomineeGovernorAddress
    );
  } catch (err) {
    debug.app(
      "checkElectionStatus failed in override mode (non-fatal): %O",
      err
    );
  }

  const nDetails: Record<number, NomineeElectionDetails> = {};
  const mDetails: Record<number, MemberElectionDetails> = {};

  await Promise.all(
    elections.map(async (election) => {
      if (correctVettingPeriod(election)) {
        debug.app(
          "Election %d: corrected phase to VETTING_PERIOD (override path)",
          election.electionIndex
        );
      }

      const i = election.electionIndex;
      const [nomineeResult, memberResult] = await Promise.allSettled([
        getNomineeElectionDetails(
          i,
          l2Provider,
          electionConfig.nomineeGovernorAddress
        ),
        getMemberElectionDetails(
          i,
          l2Provider,
          electionConfig.memberGovernorAddress
        ),
      ]);

      if (nomineeResult.status === "fulfilled" && nomineeResult.value) {
        let serialized = serializeNomineeDetails(nomineeResult.value);
        try {
          serialized = await enrichContenderVotes(
            serialized,
            l2Provider,
            electionConfig.nomineeGovernorAddress
          );
        } catch {
          // non-fatal
        }
        nDetails[i] = serialized;
      } else if (nomineeResult.status === "rejected") {
        debug.app(
          "Failed to get nominee details for election %d: %O",
          i,
          nomineeResult.reason
        );
      }

      if (memberResult.status === "fulfilled" && memberResult.value) {
        mDetails[i] = serializeMemberDetails(memberResult.value);
      } else if (memberResult.status === "rejected") {
        debug.app(
          "Failed to get member details for election %d: %O",
          i,
          memberResult.reason
        );
      }
    })
  );

  const latestL1Block = await getL1BlockFromL2(l2Provider);

  return {
    status,
    elections: preventPhaseRegression(elections),
    nomineeDetailsMap: nDetails,
    memberDetailsMap: mDetails,
    latestL1Block,
  };
}
