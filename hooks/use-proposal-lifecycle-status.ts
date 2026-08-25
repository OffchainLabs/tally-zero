"use client";

/**
 * Resolves the status a proposal row should display, reading the chain rather
 * than trusting a single state name.
 *
 * Two things the governor's `state()` cannot tell you on its own:
 *
 * - It says `Executed` for a Core Governor proposal as soon as the L2 timelock
 *   operation runs, which is where the L1 round trip *starts*. Only a completed
 *   `RETRYABLE_EXECUTED` stage means the proposal actually happened.
 * - gov-tracker's `TrackingResult.currentState` is no help either: it caches the
 *   `proposalState` snapshot taken at vote-end, so it freezes at `Queued` and
 *   never advances. Stage statuses are the source of truth after the vote; the
 *   governor is the source of truth before it.
 *
 * A trace costs around eight seconds against a cold cache and runs two at a
 * time, so it is spent only where it changes the answer: see
 * `shouldTrackProposalLifecycle`.
 */

import { isCoreGovernor } from "@/config/governors";
import { useL1Block } from "@/hooks/use-l1-block";
import { useProposalStages } from "@/hooks/use-proposal-stages";
import {
  getEffectiveDisplayState,
  type ProposalDisplayStatus,
} from "@/lib/lifecycle-utils";
import { couldBeMidRoundTrip } from "@/lib/proposal-utils";
import { normalizeProposalStateName } from "@/lib/state-utils";
import type { ProposalStage } from "@/types/proposal-stage";

/** The proposal fields the status depends on */
export interface ProposalLifecycleInput {
  id: string;
  state: string;
  contractAddress: string;
  creationTxHash?: string;
  /** Vote snapshot block, which dates the proposal against the round-trip window */
  startBlock?: string;
}

export interface ProposalLifecycleStatus extends ProposalDisplayStatus {
  /**
   * The displayed status can still change, because the trace that decides it has
   * not finished. Callers should render a loading placeholder rather than a
   * status the next second overwrites.
   */
  isResolving: boolean;
  /** Whether this row's lifecycle is being read from the chain at all */
  isTracked: boolean;
  /** Tracking is in the queue behind other proposals (max 2 run at once) */
  isQueued: boolean;
  /** Position in that queue, when queued */
  queuePosition: number | null;
  /** Tracking is running now */
  isLoading: boolean;
  /** Tracking finished */
  isComplete: boolean;
  /** Tracking failed; `display` falls back to the governor's answer */
  error: string | null;
  /** Stages discovered so far */
  stages: ProposalStage[];
  /** Index of the stage being worked on */
  currentStageIndex: number;
  /** A finished trace is being refreshed in the background */
  isBackgroundRefreshing: boolean;
}

/**
 * Whether tracing this proposal can tell the reader anything.
 *
 * Only one case can: a Core Governor proposal the governor calls `Executed`
 * that is recent enough to still be in its L1 round trip, where the stages
 * decide between `Executing` and `Executed`. Every other status passes through
 * from the governor untouched, so a trace spends around eight seconds
 * confirming what the row already says.
 *
 * That distinction is the whole performance story of this column. Reading
 * creation transaction hashes from the indexer made every row traceable, and
 * tracing every traceable row put six of the first ten behind a two-at-a-time
 * queue: roughly 24 seconds before the last one resolved, all of it spent
 * confirming `Executed` on proposals that finished months ago.
 */
export function shouldTrackProposalLifecycle(
  proposal: ProposalLifecycleInput,
  currentGovernorBlock: number | null
): boolean {
  return (
    isRoundTripCandidate(proposal) &&
    couldBeMidRoundTrip(proposal, currentGovernorBlock)
  );
}

/**
 * The half of that decision that does not need the governor clock: a Core
 * proposal reported `Executed` with something to trace. Only these rows care
 * how old they are, so only these wait for the clock before the status settles.
 */
function isRoundTripCandidate(proposal: ProposalLifecycleInput): boolean {
  return (
    Boolean(proposal.creationTxHash) &&
    normalizeProposalStateName(proposal.state) === "Executed" &&
    isCoreGovernor(proposal.contractAddress)
  );
}

export interface UseProposalLifecycleStatusOptions {
  /**
   * Set false to skip tracing entirely and render the governor's own answer.
   * Only the `Executed` label can differ from it, so a caller that just needs
   * the label can gate on that and pay for no RPC work elsewhere.
   */
  enabled?: boolean;
}

export function useProposalLifecycleStatus(
  proposal: ProposalLifecycleInput,
  { enabled = true }: UseProposalLifecycleStatusOptions = {}
): ProposalLifecycleStatus {
  // The governor clock is the L1 block height, and this is the same shared
  // query every other surface reads, so it costs nothing here.
  const { currentL1Block, isLoading: isClockLoading } = useL1Block();
  const isTracked =
    enabled && shouldTrackProposalLifecycle(proposal, currentL1Block);

  // Until the clock arrives there is no telling whether this row needs a trace.
  // Showing the governor's "Executed" in the meantime would mean flashing an
  // answer the trace is about to replace with "Executing".
  const isAwaitingClock =
    enabled && isClockLoading && isRoundTripCandidate(proposal);

  const {
    stages,
    currentStageIndex,
    isLoading,
    isQueued,
    queuePosition,
    isComplete,
    error,
    result,
    isBackgroundRefreshing,
  } = useProposalStages({
    proposalId: proposal.id,
    creationTxHash: proposal.creationTxHash || "",
    governorAddress: proposal.contractAddress,
    enabled: isTracked,
  });

  // Stage statuses always win when there are any: they were read from the
  // chain, even if the trace later failed. With none, a failed trace leaves
  // nothing better than the governor's own answer, so fall back to it rather
  // than keep claiming the round trip is unfinished.
  const status = getEffectiveDisplayState(
    proposal.state,
    stages,
    proposal.contractAddress,
    isTracked && !error
  );

  return {
    ...status,
    // Queued counts as unresolved too: a trace waiting for one of the two
    // tracking slots has produced nothing to show yet. A finished trace being
    // refreshed in the background does not, hence the check on `result` rather
    // than on `isLoading`: that session goes back to loading while still
    // holding a resolved answer, and blanking a settled row would be its own
    // kind of flicker.
    isResolving:
      isAwaitingClock ||
      (isTracked && !error && !isComplete && result === null),
    isTracked,
    isQueued,
    queuePosition,
    isLoading,
    isComplete,
    error,
    stages,
    currentStageIndex,
    isBackgroundRefreshing,
  };
}
