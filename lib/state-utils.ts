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

/** Canonical (capitalized) spelling of every governor state name */
const PROPOSAL_STATE_NAMES: readonly ProposalStateName[] = [
  "Pending",
  "Active",
  "Canceled",
  "Defeated",
  "Succeeded",
  "Queued",
  "Expired",
  "Executed",
];

/** Pre-computed Map for O(1) canonical-name lookup by lowercased name */
const stateNamesByLowercase = new Map(
  PROPOSAL_STATE_NAMES.map((name) => [name.toLowerCase(), name])
);

/**
 * Normalize a proposal state to its canonical capitalized name
 *
 * State names reach the app in two casings: the indexer feed uses the
 * capitalized names, while `getStateName` lowercases the numeric state read
 * from the governor contract. Comparisons across the app (`sortProposals`'s
 * Active-first ordering, the `QuorumCell` Executed shortcut) test capitalized
 * literals, so RPC-derived states have to be normalized before they are stored
 * or compared.
 *
 * @param state - A proposal state name in any casing
 * @returns The canonical state name, or "Unknown" if unrecognized
 */
export function normalizeProposalStateName(
  state: string | null | undefined
): ProposalStateName {
  if (!state) return "Unknown";
  return stateNamesByLowercase.get(state.trim().toLowerCase()) ?? "Unknown";
}

/**
 * States that are still in flight and are therefore never trusted as final.
 *
 * Kept separate from the `Defeated` case, which is only re-read while the vote
 * could still be open. See `needsOnChainStateRefresh` in `lib/proposal-utils`.
 */
export const IN_FLIGHT_PROPOSAL_STATES: readonly ProposalStateName[] = [
  "Pending",
  "Active",
  "Unknown",
];
