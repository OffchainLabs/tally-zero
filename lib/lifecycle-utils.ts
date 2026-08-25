/**
 * Utilities for proposal lifecycle management and state display
 * Handles stage tracking, state formatting, and progress calculation
 */

import { getFinalStageForGovernor, isCoreGovernor } from "@/config/governors";
import { normalizeProposalStateName } from "@/lib/state-utils";
import type { ProposalStateName } from "@/types/proposal";
import type { ProposalStage } from "@/types/proposal-stage";
import {
  formatStageTitle,
  getLifecyclePhase,
  type LifecyclePhase,
  type StageType,
} from "@gzeoneth/gov-tracker";

/**
 * Format a stage name from UPPER_SNAKE_CASE to Title Case
 * Uses gov-tracker's formatStageTitle for known stage types
 * Falls back to basic formatting for UI strings like "Starting..."
 * @param stageName - The stage name in UPPER_SNAKE_CASE (e.g., "VOTING_ACTIVE")
 * @returns Formatted stage name (e.g., "Voting Active")
 */
export function formatStageName(stageName: string): string {
  try {
    return formatStageTitle(stageName as StageType);
  } catch {
    // Fallback for UI strings that aren't valid stage types (e.g., "Starting...")
    return stageName
      .replace(/_/g, " ")
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }
}

/**
 * Get the total expected stages for a proposal based on governor type
 * - Core Governor: 7 stages (includes L1 round-trip)
 * - Treasury Governor: 4 stages (L2 only)
 */
export function getTotalStages(governorAddress: string): number {
  return isCoreGovernor(governorAddress) ? 7 : 4;
}

/** A stage is done when it either completed or was skipped as unnecessary */
function isStageSettled(stage: ProposalStage | undefined): boolean {
  return stage?.status === "COMPLETED" || stage?.status === "SKIPPED";
}

/**
 * How many stages of the lifecycle are behind the proposal.
 *
 * Counted rather than positional, because a stage array is not always the full
 * lifecycle: a tracking run fills it in as it goes and a cached checkpoint holds
 * only what the run reached.
 */
function getSettledStageCount(stages: ProposalStage[]): number {
  return stages.filter(isStageSettled).length;
}

/**
 * Check if a proposal has truly reached the end of its lifecycle.
 *
 * Asks whether the governor's own final stage (`RETRYABLE_EXECUTED` for Core,
 * `L2_TIMELOCK` for Treasury) is present and settled, which is the hop that
 * actually applies the change.
 *
 * Deliberately not gov-tracker's `areAllStagesComplete`, and not
 * `getLifecyclePhase() === "executed"`. Both answer "is every stage in this
 * array done", and the array is frequently a prefix of the lifecycle: tracking
 * fills it in stage by stage, and a checkpoint saved on a stage boundary holds
 * nothing but COMPLETED stages. On that input both report a mid-flight proposal
 * as finished, which is the exact mistake this module exists to avoid.
 *
 * @param stages - Array of proposal stages to check
 * @param governorAddress - The governor contract address, which decides which
 *   stage is the last one
 */
export function isProposalFullyExecuted(
  stages: ProposalStage[],
  governorAddress: string
): boolean {
  if (!stages || stages.length === 0) return false;

  const finalStage = getFinalStageForGovernor(governorAddress);
  if (!finalStage) return false;

  return isStageSettled(stages.find((stage) => stage.type === finalStage));
}

/** What each in-flight lifecycle phase is called in the UI */
const PHASE_LABELS: Record<LifecyclePhase, string> = {
  voting: "Voting",
  queued: "Queued in the timelock",
  l2_delay: "Waiting out the L2 timelock",
  bridging: "Bridging from L2 to L1",
  l1_delay: "Waiting out the L1 timelock",
  finalizing: "Redeeming the retryable ticket",
  executed: "Fully executed",
  failed: "Failed",
  unknown: "Unknown",
};

/** The status a proposal row shows: a governor state, or "Executing" */
export type ProposalDisplayState = ProposalStateName | "Executing";

/** Resolved status for one proposal row */
export interface ProposalDisplayStatus {
  /** Label to render, e.g. "Queued", "Executing", "Executed" */
  display: string;
  /** Key for the colour / dot / badge lookups, e.g. "Executing" */
  state: ProposalDisplayState;
  /** Whether the proposal is still moving through the timelocks */
  isInProgress: boolean;
  /** Sentence describing the current lifecycle phase, when stages are known */
  phaseLabel: string | null;
  /** 1-indexed current stage, or null when no stages are known */
  currentStage: number | null;
  /** Total stages expected for this governor */
  totalStages: number;
}

/**
 * Get the effective display state for a proposal.
 *
 * The governor's own `Executed` is not the end of a Core Governor proposal: it
 * means the L2 timelock operation ran and handed the payload to
 * `ArbSys.sendTxToL1`. The proposal still has to clear the L2-to-L1 challenge
 * period, the 3-day L1 timelock and the retryable ticket redemption on L2 —
 * roughly ten more days — before anything it asks for has actually happened.
 * That stretch is reported as **Executing**, and only a settled
 * `RETRYABLE_EXECUTED` stage turns it into `Executed`. See
 * {@link isProposalFullyExecuted} for why that one stage decides it.
 *
 * Treasury Governor proposals never leave L2, so their `Executed` is final.
 *
 * @param governorState - The state read from the governor contract
 * @param stages - Tracked lifecycle stages; empty when none are known yet
 * @param governorAddress - The governor contract address
 * @param isTracking - Whether the lifecycle is being read right now. With no
 *   stages to go on this is what separates a Core proposal whose round trip is
 *   still being confirmed (show `Executing`; the governor has executed and it
 *   is completion that is unproven) from an untracked historic row, which keeps
 *   showing the governor's answer.
 */
export function getEffectiveDisplayState(
  governorState: string | null,
  stages: ProposalStage[],
  governorAddress: string,
  isTracking = false
): ProposalDisplayStatus {
  const totalStages = getTotalStages(governorAddress);
  const hasStages = stages && stages.length > 0;
  const isFinished =
    hasStages && isProposalFullyExecuted(stages, governorAddress);

  // Counted from the settled stages rather than read off the array's length, so
  // a partially filled stage list reports the hop actually in progress.
  const currentStage = hasStages
    ? Math.min(getSettledStageCount(stages) + (isFinished ? 0 : 1), totalStages)
    : null;

  // `getLifecyclePhase` shares the truncation blind spot described on
  // `isProposalFullyExecuted`, so its "executed" answer is only trusted once the
  // final stage agrees. Otherwise the stage counter carries the detail alone.
  const phase = hasStages ? getLifecyclePhase(stages) : null;
  const phaseLabel =
    !phase || (phase === "executed" && !isFinished)
      ? null
      : PHASE_LABELS[phase];

  const settled = (state: ProposalDisplayState): ProposalDisplayStatus => ({
    display: formatCurrentState(state),
    state,
    isInProgress: false,
    phaseLabel,
    currentStage,
    totalStages,
  });

  // Anything before execution is what the governor says it is.
  if (governorState?.toLowerCase() !== "executed") {
    return settled(normalizeProposalStateName(governorState));
  }

  // Treasury Governor proposals are L2-only: "Executed" is accurate.
  if (!isCoreGovernor(governorAddress)) {
    return settled("Executed");
  }

  if (isFinished) {
    return settled("Executed");
  }

  // Neither stages nor a trace in flight: nothing says the round trip is
  // unfinished, so keep the governor's answer rather than guess.
  if (!hasStages && !isTracking) {
    return settled("Executed");
  }

  return {
    display: "Executing",
    state: "Executing",
    isInProgress: true,
    phaseLabel,
    currentStage,
    totalStages,
  };
}

/**
 * Format a proposal state to display-friendly text
 * Maps internal state names to user-facing labels
 * @param state - The internal state name (lowercase)
 * @returns User-friendly state label
 */
export function formatCurrentState(state: string | null): string {
  if (!state) return "Unknown";

  const stateMap: Record<string, string> = {
    active: "Active",
    pending: "Pending",
    succeeded: "Passed",
    defeated: "Defeated",
    queued: "Queued",
    executing: "Executing",
    executed: "Executed",
    canceled: "Canceled",
    expired: "Expired",
    unknown: "Unknown",
  };

  const normalized = state.toLowerCase();
  return stateMap[normalized] || state;
}

/** CSS classes for state-dependent text colors */
export type StateStyleColor =
  | "text-green-600 dark:text-green-400"
  | "text-blue-600 dark:text-blue-400"
  | "text-yellow-600 dark:text-yellow-400"
  | "text-red-600 dark:text-red-400"
  | "text-muted-foreground";

/** Icon names for state-dependent display */
export type StateStyleIcon = "check" | "reload" | "clock" | "cross";

/** Default style for unknown states */
const DEFAULT_STATE_STYLE: { icon: StateStyleIcon; color: StateStyleColor } = {
  icon: "clock",
  color: "text-muted-foreground",
};

/** Lookup table for state-to-style mapping */
const STATE_STYLE_MAP: Record<
  string,
  { icon: StateStyleIcon; color: StateStyleColor }
> = {
  executed: { icon: "check", color: "text-green-600 dark:text-green-400" },
  // Mid round-trip: same "still moving" blue as the pre-vote states
  executing: { icon: "reload", color: "text-blue-600 dark:text-blue-400" },
  active: { icon: "reload", color: "text-blue-600 dark:text-blue-400" },
  pending: { icon: "reload", color: "text-blue-600 dark:text-blue-400" },
  queued: { icon: "clock", color: "text-yellow-600 dark:text-yellow-400" },
  succeeded: { icon: "clock", color: "text-yellow-600 dark:text-yellow-400" },
  defeated: { icon: "cross", color: "text-red-600 dark:text-red-400" },
  canceled: { icon: "cross", color: "text-red-600 dark:text-red-400" },
  expired: { icon: "cross", color: "text-red-600 dark:text-red-400" },
};

/**
 * Get visual styling (icon and color) for a proposal state
 * @param state - The proposal state
 * @returns Object with icon name and CSS color classes
 */
export function getStateStyle(state: string | null): {
  icon: StateStyleIcon;
  color: StateStyleColor;
} {
  if (!state) return DEFAULT_STATE_STYLE;
  return STATE_STYLE_MAP[state.toLowerCase()] ?? DEFAULT_STATE_STYLE;
}

/** Background-color class for the status dot, matching each state's hue. */
const STATE_DOT_MAP: Record<string, string> = {
  executed: "bg-green-500",
  executing: "bg-blue-500",
  active: "bg-blue-500",
  pending: "bg-blue-500",
  queued: "bg-yellow-500",
  succeeded: "bg-yellow-500",
  defeated: "bg-red-500",
  canceled: "bg-red-500",
  expired: "bg-red-500",
};

/**
 * Get the status dot background color class for a proposal state.
 * @param state - The proposal state
 * @returns A Tailwind bg-* class for the 8px status dot
 */
export function getStateDotColor(state: string | null): string {
  if (!state) return "bg-muted-foreground";
  return STATE_DOT_MAP[state.toLowerCase()] ?? "bg-muted-foreground";
}
