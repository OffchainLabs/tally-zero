/**
 * Utilities for proposal lifecycle management and state display
 * Handles stage tracking, state formatting, and progress calculation
 */

import { isCoreGovernor } from "@/config/governors";
import type { ProposalStage } from "@/types/proposal-stage";
import {
  areAllStagesComplete,
  formatStageTitle,
  getCurrentStage,
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

/**
 * Determine the current active stage (1-indexed) from the stages array
 * Uses gov-tracker's getCurrentStage for consistent stage detection
 * @param stages - Array of proposal stages
 * @returns The 1-indexed stage number of the last active stage, or 0 if empty
 */
export function getCurrentStageNumber(stages: ProposalStage[]): number {
  if (!stages || stages.length === 0) return 0;

  const currentStage = getCurrentStage(stages);
  if (!currentStage) return 1;

  // Find the index of the current stage in the array (1-indexed)
  const index = stages.findIndex((s) => s.type === currentStage.type);
  return index >= 0 ? index + 1 : 1;
}

/**
 * Check if a proposal has truly completed all stages
 * Uses gov-tracker's areAllStagesComplete for consistent completion detection
 * @param stages - Array of proposal stages to check
 * @returns True if the proposal has completed all expected stages
 */
export function isProposalFullyExecuted(stages: ProposalStage[]): boolean {
  if (!stages || stages.length === 0) return false;
  return areAllStagesComplete(stages);
}

/**
 * Get the effective display state for a proposal
 * For Core Governor proposals that show "Executed" but haven't completed L1 stages,
 * returns "Stage x/y" instead
 * @param governorState - The state from the governor contract
 * @param stages - Array of proposal stages
 * @param governorAddress - The governor contract address
 * @returns Object with display string and whether the proposal is in progress
 */
export function getEffectiveDisplayState(
  governorState: string | null,
  stages: ProposalStage[],
  governorAddress: string
): { display: string; isInProgress: boolean } {
  // If not "Executed", return the governor state as-is
  if (governorState?.toLowerCase() !== "executed") {
    return { display: formatCurrentState(governorState), isInProgress: false };
  }

  // For Treasury Governor, "Executed" is accurate after L2 timelock
  if (!isCoreGovernor(governorAddress)) {
    return { display: "Executed", isInProgress: false };
  }

  // For Core Governor, check if truly completed
  if (isProposalFullyExecuted(stages)) {
    return { display: "Executed", isInProgress: false };
  }

  // Core Governor with "Executed" state but not fully done - show stage progress
  const currentStage = getCurrentStageNumber(stages);
  const totalStages = getTotalStages(governorAddress);

  // If the current stage is the last stage but not fully complete,
  // show the previous completed stage number instead
  let displayStage = currentStage;
  if (currentStage === totalStages && !isProposalFullyExecuted(stages)) {
    // Find the last completed stage
    const completedCount = stages.filter(
      (s) => s.status === "COMPLETED"
    ).length;
    displayStage = Math.max(1, completedCount);
  }

  return {
    display: `Stage ${displayStage}/${totalStages}`,
    isInProgress: true,
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
