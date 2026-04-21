/**
 * Proposal state utilities
 * Provides state lookup and conversion for OpenZeppelin Governor states
 */

import { PROPOSAL_STATE_MAP } from "@gzeoneth/gov-tracker";

import { states } from "@/data/table/data";
import type { ProposalStateName } from "@/types/proposal";

/** State configuration type from table data */
export type StateValue = (typeof states)[number];

/** Pre-computed Map for O(1) state lookup by normalized value */
const statesByNormalizedValue = new Map(
  states.map((state) => [state.value.toLowerCase(), state])
);

/**
 * Find a state configuration by its value (case-insensitive)
 *
 * @param stateValue - The proposal state value to look up
 * @returns The state configuration object, or undefined if not found
 */
export function findStateByValue(
  stateValue: string | undefined | null
): StateValue | undefined {
  if (!stateValue) return undefined;
  return statesByNormalizedValue.get(stateValue.toLowerCase());
}

/**
 * Convert a numeric proposal state to its lowercase string name
 *
 * This is the canonical way to convert OpenZeppelin Governor state numbers
 * to the lowercase state names used throughout the app.
 *
 * @param stateNumber - The numeric state from the contract (0-7)
 * @returns The lowercase state name (e.g., "pending", "active", "executed")
 */
export function getStateName(stateNumber: number): ProposalStateName {
  const stateName = PROPOSAL_STATE_MAP[stateNumber];
  return (stateName?.toLowerCase() ?? "unknown") as ProposalStateName;
}
