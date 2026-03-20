"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  checkElectionStatus,
  createTracker,
  getAllElectionStatuses,
  getContenders,
  getElectionCount,
  getElectionStatus,
  getMemberElectionDetails,
  getNomineeElectionDetails,
  serializeMemberDetails,
  serializeNomineeDetails,
  type ElectionConfig,
  type ElectionProposalStatus,
  type ElectionStatus,
  type ChunkingConfig as GovTrackerChunkingConfig,
  type SerializableMemberDetails,
  type SerializableNomineeDetails,
} from "@gzeoneth/gov-tracker";
import { toast } from "sonner";

import { initializeBundledCache } from "@/lib/bundled-cache-loader";
import { debug } from "@/lib/debug";
import { getCacheAdapter } from "@/lib/gov-tracker-cache";
import { getOrCreateProvider } from "@/lib/rpc-utils";
import {
  ARBITRUM_RPC_URL,
  ETHEREUM_RPC_URL,
} from "@config/arbitrum-governance";

type NomineeElectionDetails = SerializableNomineeDetails | null;
type MemberElectionDetails = SerializableMemberDetails | null;

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
  nomineeGovernorAddress?: string;
  memberGovernorAddress?: string;
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
  isLoading: boolean;
  error: Error | null;
  refresh: () => void;
  selectElection: (index: number | null) => void;
}

export function useElectionStatus({
  enabled = true,
  l2RpcUrl,
  l1RpcUrl,
  l1ChunkSize,
  l2ChunkSize,
  refreshInterval = 60000,
  selectedElectionIndex: initialSelectedIndex = null,
  nomineeGovernorAddress,
  memberGovernorAddress,
}: UseElectionStatusOptions = {}): UseElectionStatusResult {
  const hasAddressOverrides = !!(
    nomineeGovernorAddress && memberGovernorAddress
  );
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

  // Use refs for tracking state that shouldn't trigger re-renders
  const trackingIndicesRef = useRef<Set<number>>(new Set());
  const shownErrorToastRef = useRef(false);
  const initialLoadDoneRef = useRef(false);
  const selectedIndexRef = useRef(selectedIndex);
  const bundledCacheInitializedRef = useRef(false);
  const fetchInFlightRef = useRef(false);

  // Keep selectedIndexRef in sync
  useEffect(() => {
    selectedIndexRef.current = selectedIndex;
  }, [selectedIndex]);

  const l2Url = l2RpcUrl || ARBITRUM_RPC_URL;
  const l1Url = l1RpcUrl || ETHEREUM_RPC_URL;

  // Reset error toast ref when URLs change
  useEffect(() => {
    shownErrorToastRef.current = false;
  }, [l2Url, l1Url]);

  // Stable chunking config - only create object when values are truthy
  const chunkingConfig = useMemo<GovTrackerChunkingConfig | undefined>(() => {
    if (!l1ChunkSize && !l2ChunkSize) return undefined;
    return {
      l1ChunkSize: l1ChunkSize ?? 10000,
      l2ChunkSize: l2ChunkSize ?? 10000000,
      delayBetweenChunks: 100,
    };
  }, [l1ChunkSize, l2ChunkSize]);

  // Create tracker with providers - memoized to avoid recreation
  const getTracker = useCallback(async () => {
    const cache = getCacheAdapter();

    if (!bundledCacheInitializedRef.current) {
      await initializeBundledCache(cache);
      bundledCacheInitializedRef.current = true;
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
  }, [l2Url, l1Url, chunkingConfig]);

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
    ? (nomineeDetailsMap[selectedElection.electionIndex] ?? null)
    : null;
  const memberDetails = selectedElection
    ? (memberDetailsMap[selectedElection.electionIndex] ?? null)
    : null;

  const electionConfig = useMemo<ElectionConfig | undefined>(() => {
    if (!nomineeGovernorAddress || !memberGovernorAddress) return undefined;
    return {
      nomineeGovernorAddress: nomineeGovernorAddress as `0x${string}`,
      memberGovernorAddress: memberGovernorAddress as `0x${string}`,
      chainId: 42161,
    };
  }, [nomineeGovernorAddress, memberGovernorAddress]);

  const fetchWithOverrides = useCallback(async () => {
    if (!electionConfig) return;

    const l2Provider = getOrCreateProvider(l2Url);
    const l1Provider = getOrCreateProvider(l1Url);

    debug.app("Fetching election data with address overrides...");

    const elections = await getAllElectionStatuses(l2Provider, electionConfig);
    debug.app("Fetched %d elections via override config", elections.length);

    setAllElections(elections);

    try {
      const electionStatus = await checkElectionStatus(
        l2Provider,
        l1Provider,
        electionConfig.nomineeGovernorAddress
      );
      setStatus(electionStatus);
    } catch (err) {
      debug.app(
        "checkElectionStatus failed in override mode (non-fatal): %O",
        err
      );
    }

    const nDetails: Record<number, NomineeElectionDetails> = {};
    const mDetails: Record<number, MemberElectionDetails> = {};

    for (const election of elections) {
      const i = election.electionIndex;
      try {
        const nd = await getNomineeElectionDetails(
          i,
          l2Provider,
          electionConfig.nomineeGovernorAddress
        );
        if (nd) nDetails[i] = serializeNomineeDetails(nd);
      } catch (err) {
        debug.app("Failed to get nominee details for election %d: %O", i, err);
      }
      try {
        const md = await getMemberElectionDetails(
          i,
          l2Provider,
          electionConfig.memberGovernorAddress
        );
        if (md) mDetails[i] = serializeMemberDetails(md);
      } catch (err) {
        debug.app("Failed to get member details for election %d: %O", i, err);
      }
    }

    setNomineeDetailsMap(nDetails);
    setMemberDetailsMap(mDetails);
    initialLoadDoneRef.current = true;
  }, [l2Url, l1Url, electionConfig]);

  const fetchDefault = useCallback(async () => {
    const { tracker, l2Provider, l1Provider } = await getTracker();

    debug.app("Fetching SC election status...");

    const electionCount = await getElectionCount(l2Provider);
    debug.app("Election count: %d", electionCount);

    const cachedElections: ElectionProposalStatus[] = [];
    const cachedNomineeDetails: Record<number, NomineeElectionDetails> = {};
    const cachedMemberDetails: Record<number, MemberElectionDetails> = {};

    const checkpointResults = await Promise.all(
      Array.from({ length: electionCount }, (_, i) =>
        tracker
          .getElectionCheckpoint(i)
          .then((checkpoint) => ({ index: i, checkpoint }))
      )
    );

    for (const { index: i, checkpoint } of checkpointResults) {
      if (checkpoint && checkpoint.status.phase !== "NOT_STARTED") {
        debug.cache(
          "Election %d loaded from cache: %s",
          i,
          checkpoint.status.phase
        );
        cachedElections.push(checkpoint.status);
        if (checkpoint.nomineeDetails) {
          cachedNomineeDetails[i] = checkpoint.nomineeDetails;
        }
        if (checkpoint.memberDetails) {
          cachedMemberDetails[i] = checkpoint.memberDetails;
        }
      }
    }

    // Only treat COMPLETED elections as fully cached.
    // Active elections need live-fetching to pick up new contenders/nominees.
    const cachedIndices = new Set(
      cachedElections
        .filter((e) => e.phase === "COMPLETED")
        .map((e) => e.electionIndex)
    );
    const uncachedIndices = Array.from(
      { length: electionCount },
      (_, i) => i
    ).filter((i) => !cachedIndices.has(i));

    const [liveResults] = await Promise.all([
      Promise.all(
        uncachedIndices.map(async (i) => {
          try {
            const liveStatus = await getElectionStatus(l2Provider, i);
            debug.app("Election %d fetched live: %s", i, liveStatus.phase);

            let nd: NomineeElectionDetails = null;
            const raw = await getNomineeElectionDetails(i, l2Provider).catch(
              () => null
            );
            if (raw) {
              nd = serializeNomineeDetails(raw);
            } else if (liveStatus.nomineeProposalId) {
              const contenders = await getContenders(
                liveStatus.nomineeProposalId,
                l2Provider
              ).catch(() => []);
              if (contenders.length > 0) {
                nd = {
                  proposalId: liveStatus.nomineeProposalId,
                  electionIndex: i,
                  contenders: contenders.map((c) => ({
                    address: c.address,
                    registeredAtBlock: c.registeredAtBlock,
                    registrationTxHash: c.registrationTxHash,
                  })),
                  nominees: [],
                  compliantNominees: [],
                  excludedNominees: [],
                  quorumThreshold: "0",
                  targetNomineeCount: liveStatus.targetNomineeCount,
                };
              }
            }

            let md: MemberElectionDetails = null;
            try {
              const raw = await getMemberElectionDetails(i, l2Provider);
              if (raw) md = serializeMemberDetails(raw);
            } catch (err) {
              debug.app("Member details failed for election %d: %O", i, err);
            }

            return { index: i, status: liveStatus, nominee: nd, member: md };
          } catch (err) {
            debug.app("Election %d live fetch failed: %O", i, err);
            return null;
          }
        })
      ),
      checkElectionStatus(l2Provider, l1Provider)
        .then((electionStatus) => {
          setStatus(electionStatus);
          debug.app(
            "Election status: count=%d, canCreate=%s",
            electionStatus.electionCount,
            electionStatus.canCreateElection
          );
        })
        .catch((err) => {
          debug.app("checkElectionStatus failed (non-fatal): %O", err);
        }),
    ]);

    for (const result of liveResults) {
      if (!result) continue;
      // Live results for active elections replace stale cached versions
      const existingIdx = cachedElections.findIndex(
        (e) => e.electionIndex === result.index
      );
      if (existingIdx !== -1) {
        cachedElections[existingIdx] = result.status;
      } else {
        cachedElections.push(result.status);
      }
      if (result.nominee) cachedNomineeDetails[result.index] = result.nominee;
      if (result.member) cachedMemberDetails[result.index] = result.member;
    }

    cachedElections.sort((a, b) => a.electionIndex - b.electionIndex);

    setAllElections(cachedElections);
    setNomineeDetailsMap((prev) => ({ ...prev, ...cachedNomineeDetails }));
    setMemberDetailsMap((prev) => ({ ...prev, ...cachedMemberDetails }));
    initialLoadDoneRef.current = true;
  }, [getTracker]);

  const fetchElectionData = useCallback(async () => {
    if (!enabled) return;
    if (fetchInFlightRef.current) {
      debug.app("Skipping duplicate election fetch (already in-flight)");
      return;
    }

    fetchInFlightRef.current = true;
    setIsLoading(true);
    setError(null);

    try {
      if (hasAddressOverrides) {
        try {
          await fetchWithOverrides();
        } catch (overrideErr) {
          debug.app(
            "Override fetch failed, falling back to default: %O",
            overrideErr
          );
          setNomineeDetailsMap({});
          setMemberDetailsMap({});
          await fetchDefault();
        }
      } else {
        await fetchDefault();
      }
    } catch (err) {
      debug.app("Election status error: %O", err);
      const error = err instanceof Error ? err : new Error(String(err));
      if (!initialLoadDoneRef.current) {
        setError(error);
      }

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
      fetchInFlightRef.current = false;
      setIsLoading(false);
    }
  }, [enabled, hasAddressOverrides, fetchWithOverrides, fetchDefault]);

  const refresh = useCallback(() => {
    setRefreshTrigger((prev) => prev + 1);
  }, []);

  const selectElection = useCallback((index: number | null) => {
    setSelectedIndex(index);
  }, []);

  useEffect(() => {
    fetchElectionData();
    return () => {
      fetchInFlightRef.current = false;
    };
  }, [fetchElectionData, refreshTrigger]);

  useEffect(() => {
    if (!enabled || refreshInterval <= 0) return;

    const interval = setInterval(refresh, refreshInterval);
    return () => clearInterval(interval);
  }, [enabled, refreshInterval, refresh]);

  // Track selected election on-demand if not already cached
  useEffect(() => {
    if (!enabled || !initialLoadDoneRef.current || selectedIndex === null)
      return;

    // Use a local variable to capture the index at effect time
    const indexToTrack = selectedIndex;

    // Check if election already exists
    const existingElection = allElections.find(
      (e) => e.electionIndex === indexToTrack
    );
    if (existingElection) return;

    // Check if already tracking this index (using ref to avoid dependency)
    if (trackingIndicesRef.current.has(indexToTrack)) return;

    const trackSelectedElection = async () => {
      trackingIndicesRef.current.add(indexToTrack);
      setIsLoading(true);

      try {
        const { tracker } = await getTracker();

        debug.app("On-demand tracking election %d", indexToTrack);

        const result = await tracker.trackElection(indexToTrack);

        // Verify this is still the selected index (avoid stale updates)
        if (selectedIndexRef.current !== indexToTrack) {
          debug.app(
            "Election %d tracking complete but selection changed, skipping update",
            indexToTrack
          );
          return;
        }

        if (result) {
          setAllElections((prev) => {
            // Check if already added (race condition guard)
            if (prev.some((e) => e.electionIndex === indexToTrack)) {
              return prev;
            }
            const updated = [...prev, result];
            updated.sort((a, b) => a.electionIndex - b.electionIndex);
            return updated;
          });

          // Load details from checkpoint (gov-tracker caches them for COMPLETED elections)
          const checkpoint = await tracker.getElectionCheckpoint(indexToTrack);
          if (checkpoint?.nomineeDetails) {
            setNomineeDetailsMap((prev) => ({
              ...prev,
              [indexToTrack]: checkpoint.nomineeDetails,
            }));
          }
          if (checkpoint?.memberDetails) {
            setMemberDetailsMap((prev) => ({
              ...prev,
              [indexToTrack]: checkpoint.memberDetails,
            }));
          }

          debug.app(
            "Successfully tracked election %d: %s (details cached: nominee=%s, member=%s)",
            indexToTrack,
            result.phase,
            !!checkpoint?.nomineeDetails,
            !!checkpoint?.memberDetails
          );
        }
      } catch (err) {
        debug.app("Failed to track election %d: %O", indexToTrack, err);
        // Surface error to UI
        setError(
          err instanceof Error
            ? err
            : new Error(`Failed to track election ${indexToTrack}`)
        );
      } finally {
        trackingIndicesRef.current.delete(indexToTrack);
        setIsLoading(false);
      }
    };

    trackSelectedElection();
    // Intentionally minimal deps - we use refs for tracking state
  }, [enabled, selectedIndex, allElections, getTracker]);

  return {
    status,
    allElections,
    activeElections,
    selectedElection,
    nomineeDetails,
    memberDetails,
    nomineeDetailsMap,
    memberDetailsMap,
    isLoading,
    error,
    refresh,
    selectElection,
  };
}
