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
 * Tracking costs RPC calls, so it only runs for rows that can still move and
 * that carry a creation transaction hash. Indexer rows carry none; the
 * background RPC scan in `useMultiGovernorSearch` supplies one for everything
 * created inside its recent window, which is where the in-flight proposals are.
 */

import { isCoreGovernor } from "@/config/governors";
import { useProposalStages } from "@/hooks/use-proposal-stages";
import {
  getEffectiveDisplayState,
  type ProposalDisplayStatus,
} from "@/lib/lifecycle-utils";
import type { ProposalStage } from "@/types/proposal-stage";

/** The proposal fields the status depends on */
export interface ProposalLifecycleInput {
  id: string;
  state: string;
  contractAddress: string;
  creationTxHash?: string;
}

export interface ProposalLifecycleStatus extends ProposalDisplayStatus {
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
 * States whose lifecycle is worth tracing. `succeeded` / `queued` are still
 * moving through the timelock, `pending` / `active` are pre-vote, and
 * `executed` matters only on the Core Governor, where it is the start of the
 * L1 round trip rather than the end of the proposal.
 */
export function shouldTrackProposalLifecycle({
  state,
  contractAddress,
  creationTxHash,
}: ProposalLifecycleInput): boolean {
  if (!creationTxHash) return false;

  switch (state.toLowerCase()) {
    case "pending":
    case "active":
    case "succeeded":
    case "queued":
      return true;
    case "executed":
      return isCoreGovernor(contractAddress);
    default:
      return false;
  }
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
  const isTracked = enabled && shouldTrackProposalLifecycle(proposal);

  const {
    stages,
    currentStageIndex,
    isLoading,
    isQueued,
    queuePosition,
    isComplete,
    error,
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
