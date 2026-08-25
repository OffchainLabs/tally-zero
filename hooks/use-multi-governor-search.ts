"use client";

/**
 * Hook for searching proposals across multiple governors.
 *
 * Indexer-first: the proposal list is loaded from the governance indexer in a
 * single fast query and rendered immediately. Everything else is non-blocking
 * and patches the query cache in the background: per-proposal vote summaries
 * (one indexer request each, far too slow to block on), RPC state refresh for
 * active proposals, and the RPC gap scan from the indexer watermark to the
 * chain head. See docs/plans/plan-indexer-first-proposals.md.
 */

import { useEffect, useMemo, useRef, useState } from "react";

import { useQuery, useQueryClient } from "@tanstack/react-query";

import { useL1Block } from "@/hooks/use-l1-block";
import { findByAddress } from "@/lib/address-utils";
import { buildLookupMap } from "@/lib/collection-utils";
import { debug } from "@/lib/debug";
import { getDelegateVotesWatermarkBlock } from "@/lib/delegate-cache";
import {
  parseProposals,
  refreshProposalStates,
  searchGovernor,
  type ProposalSourceInfo,
  type UseMultiGovernorSearchOptions,
  type UseMultiGovernorSearchResult,
} from "@/lib/governor-search";
import { sortProposals } from "@/lib/proposal-cache";
import {
  subscribeToVoteUpdates,
  type VoteUpdate,
} from "@/lib/proposal-tracker-manager";
import {
  isProposalStateUnverified,
  LIFECYCLE_WINDOW_DAYS,
  needsOnChainStateRefresh,
  type StateVerificationProgress,
} from "@/lib/proposal-utils";
import { createRpcProvider } from "@/lib/rpc-utils";
import { normalizeProposalStateName } from "@/lib/state-utils";
import { getTallyDataClient } from "@/lib/tally-data/client";
import type {
  TallyProposalIndexEntry,
  TallyProposalVoteSummary,
} from "@/lib/tally-data/types";
import type { ParsedProposal, ProposalVotes } from "@/types/proposal";
import {
  ARBITRUM_CHAIN_ID,
  ARBITRUM_GOVERNORS,
  ARBITRUM_RPC_URL,
} from "@config/arbitrum-governance";
import { BLOCKS_PER_DAY } from "@config/block-times";

/** Default block range for chunked RPC queries */
const DEFAULT_BLOCK_RANGE = 10000000;
const UNKNOWN_PROPOSER = "0x0000000000000000000000000000000000000000";

/**
 * How far back the RPC pass always scans for `ProposalCreated` events,
 * regardless of how far the indexer has caught up.
 *
 * {@link LIFECYCLE_WINDOW_DAYS} covers every proposal that could still be
 * moving. Scanning them is what gives those rows a `creationTxHash` — the
 * indexer index carries none — which is the only handle the lifecycle tracker
 * has for deciding whether a Core proposal reported as `Executed` has actually
 * finished its L1 round trip. It also re-reads their state and votes from the
 * governor. At the default 10M block range this is 3 chunked `eth_getLogs` per
 * governor, once per session, in the background.
 */
const RECENT_LIFECYCLE_SCAN_BLOCKS =
  LIFECYCLE_WINDOW_DAYS * BLOCKS_PER_DAY.arbitrum;

/**
 * Vote summaries are one request per proposal; fetch them in small batches so
 * the background fill does not monopolize the browser's per-origin connection
 * pool (6 on HTTP/1.1) while the user navigates.
 */
const VOTE_SUMMARY_BATCH_SIZE = 8;

/** Query key factory for proposal searches */
export const proposalKeys = {
  all: ["proposals"] as const,
  indexer: () => ["proposals", "indexer"] as const,
};

/** Shape of data stored in the TanStack Query cache */
export interface ProposalSearchData {
  proposals: ParsedProposal[];
  sourceInfo: ProposalSourceInfo;
}

/** Everything a finished reconciliation pass folds back into the cache */
export interface ReconciliationResult {
  /** Proposals re-read from the governor with `state()` / `proposalVotes()` */
  refreshed: ParsedProposal[];
  /** Proposals discovered by the watermark-to-head log scan */
  gapProposals: ParsedProposal[];
  /** First block of the gap scan, or null when it was skipped */
  scanStartBlock: number | null;
  /** L2 chain head the pass ran against */
  currentBlock: number;
  /** Indexer watermark the pass ran against */
  watermarkBlock: number;
}

function proposalIdentityKey(
  proposalId: string,
  governorAddress: string
): string {
  return `${proposalId}:${governorAddress.toLowerCase()}`;
}

function proposalKey(proposal: ParsedProposal): string {
  return proposalIdentityKey(proposal.id, proposal.contractAddress);
}

/**
 * Restate an RPC-derived proposal with the canonical state casing.
 *
 * `refreshProposalStates` and `parseProposals` build their state with
 * `getStateName`, which lowercases; the indexer feed and every state comparison
 * in the table path (`sortProposals`, `mergeProposal`'s Unknown guard,
 * `sameStateAndVotes`) use the capitalized names. Without this, a proposal
 * corrected from "Defeated" to "active" would not sort ahead of the settled
 * rows, and every reconcile pass would report a spurious change.
 */
function withCanonicalState(proposal: ParsedProposal): ParsedProposal {
  const state = normalizeProposalStateName(proposal.state);
  return proposal.state === state ? proposal : { ...proposal, state };
}

function voteSummaryToProposalVotes(
  summary: TallyProposalVoteSummary | null
): ProposalVotes | undefined {
  if (!summary || summary.totalCount === 0) return undefined;

  return {
    forVotes: summary.for.weight,
    againstVotes: summary.against.weight,
    abstainVotes: summary.abstain.weight,
    quorum: undefined,
  };
}

function proposalFromSqliteIndexEntry(
  entry: TallyProposalIndexEntry,
  voteSummary: TallyProposalVoteSummary | null
): ParsedProposal {
  const governor = findByAddress(ARBITRUM_GOVERNORS, entry.governorAddress);

  return {
    id: entry.proposalId,
    contractAddress: entry.governorAddress as ParsedProposal["contractAddress"],
    proposer: entry.proposer ?? UNKNOWN_PROPOSER,
    targets: [],
    values: [],
    signatures: [],
    calldatas: [],
    startBlock: String(entry.snapshotBlock),
    endBlock: "0",
    description: entry.description ?? `Proposal ${entry.proposalId}`,
    networkId: String(ARBITRUM_CHAIN_ID),
    state: normalizeProposalStateName(entry.state),
    governorName: governor?.name ?? "Unknown",
    votes: voteSummaryToProposalVotes(voteSummary),
  };
}

function isPlaceholderProposal(proposal: ParsedProposal): boolean {
  const description = proposal.description.trim();

  return (
    (!description || description === `Proposal ${proposal.id}`) &&
    (proposal.proposer === UNKNOWN_PROPOSER || proposal.proposer === "Unknown")
  );
}

function mergeProposal(
  existing: ParsedProposal,
  incoming: ParsedProposal
): ParsedProposal {
  const incomingIsPlaceholder = isPlaceholderProposal(incoming);
  const existingIsPlaceholder = isPlaceholderProposal(existing);
  const state = incoming.state === "Unknown" ? existing.state : incoming.state;

  if (incomingIsPlaceholder && !existingIsPlaceholder) {
    return {
      ...existing,
      state,
      votes: existing.votes ?? incoming.votes,
      governorName: existing.governorName || incoming.governorName,
      startBlock:
        existing.startBlock !== "0" ? existing.startBlock : incoming.startBlock,
      endBlock:
        existing.endBlock !== "0" ? existing.endBlock : incoming.endBlock,
    };
  }

  if (!incomingIsPlaceholder && existingIsPlaceholder) {
    return {
      ...incoming,
      votes: incoming.votes ?? existing.votes,
      state,
    };
  }

  return {
    ...incoming,
    votes: incoming.votes ?? existing.votes,
    state,
    stages: incoming.stages ?? existing.stages,
    timelockLink: incoming.timelockLink ?? existing.timelockLink,
  };
}

function upsertProposal(
  proposalsByKey: Map<string, ParsedProposal>,
  proposal: ParsedProposal
): void {
  const key = proposalKey(proposal);
  const existing = proposalsByKey.get(key);

  proposalsByKey.set(
    key,
    existing ? mergeProposal(existing, proposal) : proposal
  );
}

function sameStateAndVotes(a: ParsedProposal, b: ParsedProposal): boolean {
  return (
    a.state === b.state &&
    a.votes?.forVotes === b.votes?.forVotes &&
    a.votes?.againstVotes === b.votes?.againstVotes &&
    a.votes?.abstainVotes === b.votes?.abstainVotes &&
    a.votes?.quorum === b.votes?.quorum
  );
}

/**
 * Fold a finished reconciliation pass into the cached search data.
 *
 * This is where an indexed state that lost to the chain gets corrected, so a
 * `Defeated` proposal whose deadline was extended by a late-quorum extension
 * becomes `Active` here and sorts back to the top of the table.
 *
 * Returns `prev` unchanged when nothing differs, so the query cache does not
 * churn (and the effect that wrote it does not re-run).
 */
export function applyReconciliation(
  prev: ProposalSearchData,
  {
    refreshed,
    gapProposals,
    scanStartBlock,
    currentBlock,
    watermarkBlock,
  }: ReconciliationResult
): ProposalSearchData {
  const refreshedMap = buildLookupMap(
    refreshed.map(withCanonicalState),
    proposalKey
  );

  let changed = !prev.sourceInfo.reconciled;

  const proposalsByKey = new Map<string, ParsedProposal>();
  for (const proposal of prev.proposals) {
    const updated = refreshedMap.get(proposalKey(proposal));
    if (updated && !sameStateAndVotes(updated, proposal)) {
      changed = true;
      proposalsByKey.set(
        proposalKey(proposal),
        mergeProposal(proposal, updated)
      );
    } else {
      proposalsByKey.set(proposalKey(proposal), proposal);
    }
  }

  let rpcFreshCount = prev.sourceInfo.rpcFreshCount;
  for (const proposal of gapProposals.map(withCanonicalState)) {
    if (!proposalsByKey.has(proposalKey(proposal))) {
      rpcFreshCount++;
    }
    changed = true;
    upsertProposal(proposalsByKey, proposal);
  }

  if (!changed) return prev;

  return {
    proposals: sortProposals(Array.from(proposalsByKey.values())),
    sourceInfo: {
      ...prev.sourceInfo,
      rpcFreshCount,
      reconciled: true,
      rangeInfo:
        scanStartBlock !== null
          ? `RPC scan: ${scanStartBlock} → ${currentBlock}`
          : `Indexer synced to block ${watermarkBlock} (head ${currentBlock})`,
    },
  };
}

/**
 * Loads all proposals from the governance indexer index (one request).
 * Vote summaries are filled in later by the background effect.
 * Throws if the index fetch fails.
 */
async function loadIndexedProposals(): Promise<ParsedProposal[]> {
  const client = getTallyDataClient();
  const entries = await client.getProposalsIndex();

  return entries.map((entry) => proposalFromSqliteIndexEntry(entry, null));
}

/**
 * Hook for searching proposals across Core and Treasury governors.
 * Renders indexer data immediately; RPC state refresh and gap scan run in the
 * background and patch the shared query cache.
 */
export function useMultiGovernorSearch({
  daysToSearch,
  enabled,
  customRpcUrl,
  blockRange = DEFAULT_BLOCK_RANGE,
}: UseMultiGovernorSearchOptions): UseMultiGovernorSearchResult {
  const lastReconcileKeyRef = useRef<string | null>(null);
  const reconcileRunIdRef = useRef(0);
  const requestedVoteSummariesRef = useRef<Set<string>>(new Set());
  const [isReconciling, setIsReconciling] = useState(false);
  const [rpcError, setRpcError] = useState<Error | null>(null);
  const queryClient = useQueryClient();

  // The governor clock is the L1 block height (Arbitrum's `block.number`), so
  // this is what proposal snapshot and deadline blocks are measured in. Shared
  // query cache, so this costs nothing beyond what other surfaces already pay.
  const { currentL1Block, isLoading: isL1BlockLoading } = useL1Block();

  const rpcUrl = customRpcUrl || ARBITRUM_RPC_URL;

  const {
    data,
    error: queryError,
    isFetching,
  } = useQuery<ProposalSearchData>({
    queryKey: proposalKeys.indexer(),
    queryFn: async () => {
      try {
        const [indexedProposals, watermarkBlock] = await Promise.all([
          loadIndexedProposals(),
          getDelegateVotesWatermarkBlock().catch(() => 0),
        ]);

        const proposalsByKey = new Map<string, ParsedProposal>();
        for (const proposal of indexedProposals) {
          upsertProposal(proposalsByKey, proposal);
        }

        debug.search(
          "loaded %d proposals from indexer (watermark block %d)",
          proposalsByKey.size,
          watermarkBlock
        );

        return {
          proposals: sortProposals(Array.from(proposalsByKey.values())),
          sourceInfo: {
            indexerAvailable: true,
            indexedCount: proposalsByKey.size,
            rpcFreshCount: 0,
            watermarkBlock,
            reconciled: false,
          },
        };
      } catch (error) {
        // Indexer down or unconfigured: fall back to the background RPC
        // search, which populates this same cache entry.
        debug.search("failed to load indexed proposals: %O", error);

        return {
          proposals: [],
          sourceInfo: {
            indexerAvailable: false,
            indexedCount: 0,
            rpcFreshCount: 0,
            watermarkBlock: 0,
            reconciled: false,
          },
        };
      }
    },
    enabled,
    staleTime: Infinity, // never refetch after initial load
    gcTime: 30 * 60 * 1000, // 30 min: keep unused data in cache
    retry: false,
  });

  // Subscribe to live vote updates and patch the query cache
  useEffect(() => {
    return subscribeToVoteUpdates((update: VoteUpdate) => {
      queryClient.setQueryData<ProposalSearchData>(
        proposalKeys.indexer(),
        (prev) => {
          if (!prev) return prev;

          const updateKey = proposalIdentityKey(
            update.proposalId,
            update.governorAddress
          );
          const idx = prev.proposals.findIndex(
            (p) => proposalKey(p) === updateKey
          );

          if (idx === -1) return prev;

          debug.search(
            "updating votes for proposal %s: for=%s, against=%s",
            update.proposalId,
            update.forVotes,
            update.againstVotes
          );

          const updatedProposals = [...prev.proposals];
          updatedProposals[idx] = {
            ...prev.proposals[idx],
            votes: {
              forVotes: update.forVotes,
              againstVotes: update.againstVotes,
              abstainVotes: update.abstainVotes,
              quorum: prev.proposals[idx].votes?.quorum || "0",
            },
          };

          return { ...prev, proposals: updatedProposals };
        }
      );
    });
  }, [queryClient]);

  // Background vote-summary fill: the index query renders without votes so
  // the table is not blocked on one request per proposal. One aggregated
  // request (this app's own API route) fetches every summary; because the
  // upstream indexer serves summaries serially (~200ms each), a cold
  // aggregate can take many seconds, so the first screen of rows is also
  // fetched directly in parallel. If the aggregate fails, fall back to
  // per-proposal batches in display order. Never overwrites votes that
  // arrived from an RPC refresh.
  useEffect(() => {
    if (!enabled || isFetching || !data) return;

    const requested = requestedVoteSummariesRef.current;
    const missing = data.proposals.filter(
      (proposal) => !proposal.votes && !requested.has(proposalKey(proposal))
    );

    if (missing.length === 0) return;

    let cancelled = false;
    const client = getTallyDataClient();

    const patchVotes = (votesByKey: Map<string, ProposalVotes>) => {
      if (votesByKey.size === 0) return;

      queryClient.setQueryData<ProposalSearchData>(
        proposalKeys.indexer(),
        (prev) => {
          if (!prev) return prev;

          let changed = false;
          const proposals = prev.proposals.map((proposal) => {
            const votes = votesByKey.get(proposalKey(proposal));
            if (!votes || proposal.votes) return proposal;
            changed = true;
            return { ...proposal, votes };
          });

          return changed ? { ...prev, proposals } : prev;
        }
      );
    };

    const fetchBatch = async (batch: ParsedProposal[]) => {
      for (const proposal of batch) requested.add(proposalKey(proposal));

      const summaries = await Promise.all(
        batch.map((proposal) =>
          client
            .getProposalVoteSummary(proposal.id, proposal.contractAddress)
            .catch(() => null)
        )
      );

      if (cancelled) return;

      const votesByKey = new Map<string, ProposalVotes>();
      batch.forEach((proposal, index) => {
        const votes = voteSummaryToProposalVotes(summaries[index]);
        if (votes) votesByKey.set(proposalKey(proposal), votes);
      });

      patchVotes(votesByKey);
    };

    void (async () => {
      // Visible rows first: don't leave the first screen without vote bars
      // while a cold aggregate response is being assembled upstream.
      const firstBatchDone = fetchBatch(
        missing.slice(0, VOTE_SUMMARY_BATCH_SIZE)
      );

      const aggregated = await client
        .getAllProposalVoteSummaries()
        .catch(() => null);
      await firstBatchDone;

      if (cancelled) return;

      if (aggregated) {
        for (const proposal of missing) requested.add(proposalKey(proposal));

        const votesByKey = new Map<string, ProposalVotes>();
        for (const entry of aggregated) {
          const votes = voteSummaryToProposalVotes(entry.voteSummary);
          if (votes) {
            votesByKey.set(
              proposalIdentityKey(entry.proposalId, entry.governorAddress),
              votes
            );
          }
        }

        patchVotes(votesByKey);
        return;
      }

      debug.search("aggregated vote summaries failed, falling back to batches");

      for (
        let i = VOTE_SUMMARY_BATCH_SIZE;
        i < missing.length;
        i += VOTE_SUMMARY_BATCH_SIZE
      ) {
        if (cancelled) return;
        await fetchBatch(missing.slice(i, i + VOTE_SUMMARY_BATCH_SIZE));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [data, enabled, isFetching, queryClient]);

  // Background RPC reconciliation: re-read the states the indexer cannot be
  // trusted on (see needsOnChainStateRefresh) straight from the governor with
  // `state()`, the same call the proposal detail page makes, and scan the
  // watermark-to-head gap for proposals the indexer has not indexed yet. Never
  // blocks rendering of the indexer data.
  useEffect(() => {
    if (!enabled || isFetching || !data) return;

    const needsGapScan = !data.sourceInfo.reconciled;
    const proposalsNeedingRefresh = data.proposals.filter((proposal) =>
      needsOnChainStateRefresh(proposal, currentL1Block)
    );

    if (!needsGapScan && proposalsNeedingRefresh.length === 0) {
      return;
    }

    const reconcileKey = [
      rpcUrl,
      daysToSearch,
      blockRange,
      needsGapScan ? `gap:${data.sourceInfo.watermarkBlock}` : "nogap",
      proposalsNeedingRefresh
        .map(
          (proposal) =>
            `${proposalKey(proposal)}:${proposal.state.toLowerCase()}`
        )
        .sort()
        .join("|"),
    ].join("::");

    if (lastReconcileKeyRef.current === reconcileKey) {
      return;
    }

    lastReconcileKeyRef.current = reconcileKey;
    const runId = ++reconcileRunIdRef.current;
    // Ownership, not a cancellation flag. This effect depends on `data`, which
    // the background vote-summary fill patches while a pass is still in flight;
    // that re-runs the effect, but the re-run computes the same `reconcileKey`
    // and early-returns above without starting a pass. A boolean set from the
    // cleanup would therefore make the in-flight pass discard its results and
    // nothing would ever retry it, so live states never reached the table.
    // `runId` only advances when a pass actually starts, so a pass is abandoned
    // only when a genuinely newer one supersedes it.
    const isCurrentRun = () => reconcileRunIdRef.current === runId;
    setIsReconciling(true);
    setRpcError(null);

    void (async () => {
      try {
        const provider = await createRpcProvider(rpcUrl);
        const currentBlock = await provider.getBlockNumber();

        const watermarkBlock = data.sourceInfo.watermarkBlock;
        const userStartBlock = Math.max(
          currentBlock - BLOCKS_PER_DAY.arbitrum * daysToSearch,
          0
        );

        let gapStartBlock: number | null = null;
        if (needsGapScan) {
          if (!data.sourceInfo.indexerAvailable) {
            gapStartBlock = userStartBlock;
          } else {
            // The watermark gap covers proposals the indexer has not seen at
            // all; the lifecycle window covers proposals it has seen but may
            // report a stale state for, and which the table needs a creation
            // tx hash for. Scan from whichever reaches further back.
            const watermarkGapStart = Math.max(
              watermarkBlock + 1,
              userStartBlock
            );
            const lifecycleStart = Math.max(
              currentBlock - RECENT_LIFECYCLE_SCAN_BLOCKS,
              0
            );
            const rpcStartBlock = Math.min(watermarkGapStart, lifecycleStart);

            gapStartBlock = rpcStartBlock < currentBlock ? rpcStartBlock : null;
          }
        }

        if (gapStartBlock !== null) {
          debug.search(
            "scanning RPC blocks %d to %d (indexer watermark %d)",
            gapStartBlock,
            currentBlock,
            watermarkBlock
          );
        }

        const scanStartBlock = gapStartBlock;
        const [refreshed, gapProposals] = await Promise.all([
          proposalsNeedingRefresh.length > 0
            ? refreshProposalStates(provider, proposalsNeedingRefresh)
            : Promise.resolve([] as ParsedProposal[]),
          scanStartBlock !== null
            ? (async () => {
                const searchResults = await Promise.all(
                  ARBITRUM_GOVERNORS.map((governor) =>
                    searchGovernor(
                      provider,
                      governor.address,
                      scanStartBlock,
                      currentBlock,
                      blockRange,
                      () => {}
                    )
                  )
                );
                const rawProposals = searchResults.flat();
                return rawProposals.length > 0
                  ? parseProposals(provider, rawProposals)
                  : [];
              })()
            : Promise.resolve([] as ParsedProposal[]),
        ]);

        if (!isCurrentRun()) return;

        queryClient.setQueryData<ProposalSearchData>(
          proposalKeys.indexer(),
          (prev) =>
            prev
              ? applyReconciliation(prev, {
                  refreshed,
                  gapProposals,
                  scanStartBlock,
                  currentBlock,
                  watermarkBlock,
                })
              : prev
        );
      } catch (error) {
        debug.search("background reconciliation failed: %O", error);
        if (isCurrentRun()) setRpcError(error as Error);
      } finally {
        // Only the latest run owns the flag; a superseded run must not clear
        // (or leave set) the state of the run that replaced it.
        if (isCurrentRun()) setIsReconciling(false);
      }
    })();
  }, [
    blockRange,
    currentL1Block,
    data,
    daysToSearch,
    enabled,
    isFetching,
    queryClient,
    rpcUrl,
  ]);

  // Indexer unavailable and the RPC fallback has not finished: consumers
  // should keep showing a loader instead of an empty table.
  const waitingOnRpcFallback = Boolean(
    data &&
    !data.sourceInfo.indexerAvailable &&
    !data.sourceInfo.reconciled &&
    !rpcError
  );

  // Blocking error only when nothing could be loaded from either source
  const blockingError =
    data && !data.sourceInfo.indexerAvailable && !data.sourceInfo.reconciled
      ? rpcError
      : null;

  // Flag the rows whose indexed state the governor has not confirmed yet, so the
  // status cells can withhold a "Defeated" that reconciliation may overturn.
  // Derived on read rather than stored, so the query cache keeps holding plain
  // proposal data.
  const proposals = useMemo(() => {
    if (!data?.proposals.length) return data?.proposals ?? [];

    const cached = data.proposals;
    const progress: StateVerificationProgress = {
      currentGovernorBlock: currentL1Block,
      governorClockPending: isL1BlockLoading,
      reconciled: data.sourceInfo.reconciled,
      reconcileFailed: rpcError !== null,
    };

    let anyUnverified = false;
    const flagged = cached.map((proposal) => {
      if (!isProposalStateUnverified(proposal, progress)) return proposal;
      anyUnverified = true;
      return { ...proposal, isStateUnverified: true };
    });

    return anyUnverified ? flagged : cached;
  }, [currentL1Block, data, isL1BlockLoading, rpcError]);

  return {
    proposals,
    error: (queryError as Error | null) ?? blockingError,
    isSearching: isFetching || waitingOnRpcFallback,
    isReconciling,
    rpcError,
    sourceInfo: data?.sourceInfo,
  };
}
