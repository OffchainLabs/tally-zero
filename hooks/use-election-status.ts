"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  checkElectionStatus,
  createTracker,
  getElectionCount,
  getMemberElectionDetails,
  getNomineeElectionDetails,
  trackElectionProposal,
  type ElectionProposalStatus,
  type ElectionStatus,
  type ChunkingConfig as GovTrackerChunkingConfig,
  type ProposalStageTracker,
} from "@gzeoneth/gov-tracker";
import { ethers } from "ethers";
import { toast } from "sonner";

import { initializeBundledCache } from "@/lib/bundled-cache-loader";
import { debug } from "@/lib/debug";
import { getCacheAdapter } from "@/lib/gov-tracker-cache";
import {
  ARBITRUM_RPC_URL,
  ETHEREUM_RPC_URL,
} from "@config/arbitrum-governance";

type ElectionCheckpoint = NonNullable<
  Awaited<ReturnType<ProposalStageTracker["getElectionCheckpoint"]>>
>;
type NomineeElectionDetails = ElectionCheckpoint["nomineeDetails"];
type MemberElectionDetails = ElectionCheckpoint["memberDetails"];

type FreshNomineeDetails = Awaited<
  ReturnType<typeof getNomineeElectionDetails>
>;
type FreshMemberDetails = Awaited<ReturnType<typeof getMemberElectionDetails>>;

function serializeNomineeDetails(
  details: NonNullable<FreshNomineeDetails>
): NonNullable<NomineeElectionDetails> {
  return {
    proposalId: details.proposalId,
    electionIndex: details.electionIndex,
    contenders: details.contenders.map((c) => ({
      address: c.address,
      registeredAtBlock: c.registeredAtBlock,
      registrationTxHash: c.registrationTxHash,
    })),
    nominees: details.nominees.map((n) => ({
      address: n.address,
      votesReceived: n.votesReceived.toString(),
      isExcluded: n.isExcluded,
      nominatedAtBlock: n.nominatedAtBlock,
      excludedAtBlock: n.excludedAtBlock,
      exclusionTxHash: n.exclusionTxHash,
    })),
    compliantNominees: details.compliantNominees.map((n) => ({
      address: n.address,
      votesReceived: n.votesReceived.toString(),
      isExcluded: n.isExcluded,
      nominatedAtBlock: n.nominatedAtBlock,
      excludedAtBlock: n.excludedAtBlock,
      exclusionTxHash: n.exclusionTxHash,
    })),
    excludedNominees: details.excludedNominees.map((n) => ({
      address: n.address,
      votesReceived: n.votesReceived.toString(),
      isExcluded: n.isExcluded,
      nominatedAtBlock: n.nominatedAtBlock,
      excludedAtBlock: n.excludedAtBlock,
      exclusionTxHash: n.exclusionTxHash,
    })),
    quorumThreshold: details.quorumThreshold.toString(),
    targetNomineeCount: details.targetNomineeCount,
  };
}

function serializeMemberDetails(
  details: NonNullable<FreshMemberDetails>
): NonNullable<MemberElectionDetails> {
  return {
    proposalId: details.proposalId,
    electionIndex: details.electionIndex,
    nominees: details.nominees.map((n) => ({
      address: n.address,
      weightReceived: n.weightReceived.toString(),
      isWinner: n.isWinner,
      rank: n.rank,
    })),
    winners: details.winners,
    fullWeightDeadline: details.fullWeightDeadline,
    proposalDeadline: details.proposalDeadline,
  };
}

function isCorsOrNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  return (
    msg.includes("failed to fetch") ||
    msg.includes("network") ||
    msg.includes("cors") ||
    msg.includes("access-control-allow-origin") ||
    msg.includes("blocked by cors")
  );
}

export interface UseElectionStatusOptions {
  enabled?: boolean;
  l2RpcUrl?: string;
  l1RpcUrl?: string;
  l1ChunkSize?: number;
  l2ChunkSize?: number;
  refreshInterval?: number;
  selectedElectionIndex?: number | null;
}

export interface UseElectionStatusResult {
  status: ElectionStatus | null;
  allElections: ElectionProposalStatus[];
  activeElections: ElectionProposalStatus[];
  selectedElection: ElectionProposalStatus | null;
  nomineeDetails: NomineeElectionDetails;
  memberDetails: MemberElectionDetails;
  isLoading: boolean;
  error: Error | null;
  refresh: () => void;
  selectElection: (index: number | null) => void;
}

interface TrackerWithProviders {
  tracker: ProposalStageTracker;
  l2Provider: ethers.providers.StaticJsonRpcProvider;
  l1Provider: ethers.providers.StaticJsonRpcProvider;
}

interface ChunkSizes {
  l1ChunkSize?: number;
  l2ChunkSize?: number;
}

let cachedTracker: TrackerWithProviders | null = null;
let cachedRpcUrls: { l2: string; l1: string } | null = null;
let cachedChunkSizes: ChunkSizes | null = null;
let bundledCacheInitialized = false;

function buildChunkingConfig(
  chunkSizes?: ChunkSizes
): GovTrackerChunkingConfig | undefined {
  if (!chunkSizes?.l1ChunkSize && !chunkSizes?.l2ChunkSize) {
    return undefined;
  }
  return {
    l1ChunkSize: chunkSizes.l1ChunkSize ?? 10000,
    l2ChunkSize: chunkSizes.l2ChunkSize ?? 10000000,
    delayBetweenChunks: 100,
  };
}

async function getTrackerWithProviders(
  l2RpcUrl: string,
  l1RpcUrl: string,
  chunkSizes?: ChunkSizes
): Promise<TrackerWithProviders> {
  const cache = getCacheAdapter();

  if (!bundledCacheInitialized) {
    await initializeBundledCache(cache);
    bundledCacheInitialized = true;
  }

  // Check if we need to recreate the tracker (RPC or chunk config changed)
  const chunkConfigChanged =
    chunkSizes?.l1ChunkSize !== cachedChunkSizes?.l1ChunkSize ||
    chunkSizes?.l2ChunkSize !== cachedChunkSizes?.l2ChunkSize;

  if (
    !cachedTracker ||
    !cachedRpcUrls ||
    cachedRpcUrls.l2 !== l2RpcUrl ||
    cachedRpcUrls.l1 !== l1RpcUrl ||
    chunkConfigChanged
  ) {
    const l2Provider = new ethers.providers.StaticJsonRpcProvider(l2RpcUrl);
    const l1Provider = new ethers.providers.StaticJsonRpcProvider(l1RpcUrl);

    const chunkingConfig = buildChunkingConfig(chunkSizes);
    const tracker = createTracker({
      l2Provider,
      l1Provider,
      cache,
      chunkingConfig,
    });

    cachedTracker = { tracker, l2Provider, l1Provider };
    cachedRpcUrls = { l2: l2RpcUrl, l1: l1RpcUrl };
    cachedChunkSizes = chunkSizes ?? null;
  }

  return cachedTracker;
}

export function useElectionStatus({
  enabled = true,
  l2RpcUrl,
  l1RpcUrl,
  l1ChunkSize,
  l2ChunkSize,
  refreshInterval = 60000,
  selectedElectionIndex: initialSelectedIndex = null,
}: UseElectionStatusOptions = {}): UseElectionStatusResult {
  const [status, setStatus] = useState<ElectionStatus | null>(null);
  const [allElections, setAllElections] = useState<ElectionProposalStatus[]>(
    []
  );
  const [selectedIndex, setSelectedIndex] = useState<number | null>(
    initialSelectedIndex
  );
  const [nomineeDetailsMap, setNomineeDetailsMap] = useState<
    Record<number, NomineeElectionDetails>
  >({});
  const [memberDetailsMap, setMemberDetailsMap] = useState<
    Record<number, MemberElectionDetails>
  >({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const shownErrorToastRef = useRef(false);
  const initialLoadDoneRef = useRef(false);

  const l2Url = l2RpcUrl || ARBITRUM_RPC_URL;
  const l1Url = l1RpcUrl || ETHEREUM_RPC_URL;
  const chunkSizes: ChunkSizes | undefined =
    l1ChunkSize || l2ChunkSize ? { l1ChunkSize, l2ChunkSize } : undefined;

  const activeElections = useMemo(
    () => allElections.filter((e) => e.phase !== "COMPLETED"),
    [allElections]
  );

  const selectedElection = useMemo(() => {
    if (selectedIndex === null) {
      return activeElections[0] ?? null;
    }
    return allElections.find((e) => e.electionIndex === selectedIndex) ?? null;
  }, [allElections, activeElections, selectedIndex]);

  const nomineeDetails = selectedElection
    ? nomineeDetailsMap[selectedElection.electionIndex] ?? null
    : null;
  const memberDetails = selectedElection
    ? memberDetailsMap[selectedElection.electionIndex] ?? null
    : null;

  const fetchElectionData = useCallback(async () => {
    if (!enabled) return;

    setIsLoading(true);
    setError(null);

    try {
      const { tracker, l2Provider, l1Provider } = await getTrackerWithProviders(
        l2Url,
        l1Url,
        chunkSizes
      );

      debug.app("Fetching SC election status...");

      // Get election count first (lightweight, L2-only call)
      const electionCount = await getElectionCount(l2Provider);
      debug.app("Election count: %d", electionCount);
      const cachedElections: ElectionProposalStatus[] = [];
      const cachedNomineeDetails: Record<number, NomineeElectionDetails> = {};
      const cachedMemberDetails: Record<number, MemberElectionDetails> = {};
      const uncachedIndices: number[] = [];

      // Check cache for each election (including next potential election)
      for (let i = 0; i <= electionCount; i++) {
        const checkpoint = await tracker.getElectionCheckpoint(i);
        if (checkpoint) {
          debug.cache("Election %d loaded from cache", i);
          cachedElections.push(checkpoint.status);
          if (checkpoint.nomineeDetails) {
            cachedNomineeDetails[i] = checkpoint.nomineeDetails;
          }
          if (checkpoint.memberDetails) {
            cachedMemberDetails[i] = checkpoint.memberDetails;
          }
        } else {
          uncachedIndices.push(i);
        }
      }

      // If we have cached data and this is initial load, show it immediately
      if (cachedElections.length > 0 && !initialLoadDoneRef.current) {
        setAllElections(cachedElections);
        setNomineeDetailsMap((prev) => ({ ...prev, ...cachedNomineeDetails }));
        setMemberDetailsMap((prev) => ({ ...prev, ...cachedMemberDetails }));
        debug.app(
          "Showing %d cached elections with details while fetching fresh data",
          cachedElections.length
        );
      }

      // Fetch only uncached elections using trackElectionProposal
      let freshElections: ElectionProposalStatus[] = [];
      if (uncachedIndices.length > 0) {
        debug.app(
          "Fetching %d uncached elections: %O",
          uncachedIndices.length,
          uncachedIndices
        );

        // Fetch uncached elections in parallel
        const fetchPromises = uncachedIndices.map((index) =>
          trackElectionProposal(index, l2Provider, l1Provider).catch((err) => {
            debug.app("Failed to fetch election %d: %O", index, err);
            return null;
          })
        );
        const results = await Promise.all(fetchPromises);
        freshElections = results.filter(
          (e): e is ElectionProposalStatus => e !== null
        );

        // Save freshly fetched elections to cache
        for (const election of freshElections) {
          await tracker.saveElectionCheckpoint(election);
          debug.cache("Saved election %d to cache", election.electionIndex);
        }
      } else {
        debug.app("All %d elections loaded from cache", cachedElections.length);
      }

      // Merge cached and fresh elections, sorted by index
      const elections = [...cachedElections, ...freshElections].sort(
        (a, b) => a.electionIndex - b.electionIndex
      );
      setAllElections(elections);
      // Set cached details (fresh elections will be fetched on-demand via lazy loading)
      setNomineeDetailsMap((prev) => ({ ...prev, ...cachedNomineeDetails }));
      setMemberDetailsMap((prev) => ({ ...prev, ...cachedMemberDetails }));
      initialLoadDoneRef.current = true;

      // Fetch full election status (includes nextElectionTimestamp, canCreateElection)
      const electionStatus = await checkElectionStatus(l2Provider, l1Provider);
      setStatus(electionStatus);

      debug.app(
        "Election status: count=%d, canCreate=%s, elections=%d",
        electionStatus.electionCount,
        electionStatus.canCreateElection,
        elections.length
      );
    } catch (err) {
      debug.app("Election status error: %O", err);
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);

      if (isCorsOrNetworkError(error) && !shownErrorToastRef.current) {
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
      }
    } finally {
      setIsLoading(false);
    }
  }, [enabled, l2Url, l1Url, chunkSizes]);

  const refresh = useCallback(() => {
    setRefreshTrigger((prev) => prev + 1);
  }, []);

  const selectElection = useCallback((index: number | null) => {
    setSelectedIndex(index);
  }, []);

  useEffect(() => {
    fetchElectionData();
  }, [fetchElectionData, refreshTrigger]);

  useEffect(() => {
    if (!enabled || refreshInterval <= 0) return;

    const interval = setInterval(refresh, refreshInterval);
    return () => clearInterval(interval);
  }, [enabled, refreshInterval, refresh]);

  // Fetch details only for the selected election (lazy loading)
  useEffect(() => {
    if (!selectedElection || !enabled) return;

    const electionIndex = selectedElection.electionIndex;

    // Skip if we already have details for this election
    if (nomineeDetailsMap[electionIndex] !== undefined) {
      return;
    }

    const fetchDetails = async () => {
      try {
        const { l2Provider } = await getTrackerWithProviders(
          l2Url,
          l1Url,
          chunkSizes
        );

        debug.app("Fetching details for election %d", electionIndex);

        const nominee = await getNomineeElectionDetails(
          electionIndex,
          l2Provider
        );
        if (nominee) {
          setNomineeDetailsMap((prev) => ({
            ...prev,
            [electionIndex]: serializeNomineeDetails(nominee),
          }));
        }

        if (
          selectedElection.phase === "MEMBER_ELECTION" ||
          selectedElection.phase === "PENDING_EXECUTION" ||
          selectedElection.phase === "COMPLETED"
        ) {
          const member = await getMemberElectionDetails(
            electionIndex,
            l2Provider
          );
          if (member) {
            setMemberDetailsMap((prev) => ({
              ...prev,
              [electionIndex]: serializeMemberDetails(member),
            }));
          }
        }
      } catch (err) {
        debug.app(
          "Failed to fetch details for election %d: %O",
          electionIndex,
          err
        );
      }
    };

    fetchDetails();
  }, [selectedElection, enabled, l2Url, l1Url, chunkSizes, nomineeDetailsMap]);

  return {
    status,
    allElections,
    activeElections,
    selectedElection,
    nomineeDetails,
    memberDetails,
    isLoading,
    error,
    refresh,
    selectElection,
  };
}
