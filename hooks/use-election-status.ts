"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  checkElectionStatus,
  createTracker,
  getElectionCount,
  getMemberElectionDetails,
  getNomineeElectionDetails,
  serializeMemberDetails,
  serializeNomineeDetails,
  type ElectionProposalStatus,
  type ElectionStatus,
  type ChunkingConfig as GovTrackerChunkingConfig,
  type SerializableMemberDetails,
  type SerializableNomineeDetails,
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

  // Use refs for tracking state that shouldn't trigger re-renders
  const trackingIndicesRef = useRef<Set<number>>(new Set());
  const shownErrorToastRef = useRef(false);
  const initialLoadDoneRef = useRef(false);
  const selectedIndexRef = useRef(selectedIndex);
  const bundledCacheInitializedRef = useRef(false);

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

    const l2Provider = new ethers.providers.StaticJsonRpcProvider(l2Url);
    const l1Provider = new ethers.providers.StaticJsonRpcProvider(l1Url);

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
      const { tracker, l2Provider, l1Provider } = await getTracker();

      debug.app("Fetching SC election status (lightweight)...");

      const electionCount = await getElectionCount(l2Provider);
      debug.app("Election count: %d", electionCount);

      const cachedElections: ElectionProposalStatus[] = [];
      const cachedNomineeDetails: Record<number, NomineeElectionDetails> = {};
      const cachedMemberDetails: Record<number, MemberElectionDetails> = {};

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
        }
      }

      setAllElections(cachedElections);
      setNomineeDetailsMap((prev) => ({ ...prev, ...cachedNomineeDetails }));
      setMemberDetailsMap((prev) => ({ ...prev, ...cachedMemberDetails }));

      initialLoadDoneRef.current = true;

      const electionStatus = await checkElectionStatus(l2Provider, l1Provider);
      setStatus(electionStatus);

      debug.app(
        "Election status: count=%d, canCreate=%s, cached=%d",
        electionStatus.electionCount,
        electionStatus.canCreateElection,
        cachedElections.length
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
  }, [enabled, getTracker]);

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

  // Fetch details only for the selected election (lazy loading)
  // First checks checkpoint cache, then falls back to RPC if needed
  useEffect(() => {
    if (!selectedElection || !enabled) return;

    const electionIndex = selectedElection.electionIndex;

    if (nomineeDetailsMap[electionIndex] !== undefined) {
      return;
    }

    const fetchDetails = async () => {
      try {
        const { tracker, l2Provider } = await getTracker();

        debug.app("Fetching details for election %d", electionIndex);

        // Check checkpoint first (gov-tracker caches details for COMPLETED elections)
        const checkpoint = await tracker.getElectionCheckpoint(electionIndex);
        if (checkpoint?.nomineeDetails) {
          debug.app(
            "Election %d nominee details loaded from cache",
            electionIndex
          );
          setNomineeDetailsMap((prev) => ({
            ...prev,
            [electionIndex]: checkpoint.nomineeDetails,
          }));
          if (checkpoint.memberDetails) {
            setMemberDetailsMap((prev) => ({
              ...prev,
              [electionIndex]: checkpoint.memberDetails,
            }));
          }
          return;
        }

        // Fall back to RPC for non-cached details
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
        // Surface error to UI
        setError(
          err instanceof Error
            ? err
            : new Error(`Failed to fetch details for election ${electionIndex}`)
        );
      }
    };

    fetchDetails();
  }, [selectedElection, enabled, getTracker, nomineeDetailsMap]);

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
