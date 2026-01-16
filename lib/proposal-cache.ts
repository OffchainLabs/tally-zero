/**
 * Proposal utilities
 *
 * Provides utility functions for working with proposals.
 */

import type { ParsedProposal } from "@/types/proposal";

/** Proposal states that don't need refresh */
const FINALIZED_STATES = new Set([
  "canceled",
  "defeated",
  "succeeded",
  "queued",
  "expired",
  "executed",
]);

/**
 * Check if a proposal state is finalized (won't change)
 *
 * @param state - The proposal state string
 * @returns True if the proposal is in a finalized state
 */
export function isProposalFinalized(state: string): boolean {
  return FINALIZED_STATES.has(state.toLowerCase());
}

/**
 * Check if a proposal state needs to be refreshed
 *
 * @param state - The proposal state string
 * @returns True if the proposal is pending or active
 */
export function needsStateRefresh(state: string): boolean {
  const lowerState = state.toLowerCase();
  return lowerState === "pending" || lowerState === "active";
}

/**
 * Merge cached proposals with freshly fetched proposals
 *
 * Keeps finalized proposals from cache, uses fresh data for active proposals,
 * and adds any new proposals not in cache.
 *
 * @param cachedProposals - Proposals from cache
 * @param freshProposals - Proposals freshly fetched from RPC
 * @returns Merged array of proposals
 */
export function mergeProposals(
  cachedProposals: ParsedProposal[],
  freshProposals: ParsedProposal[]
): ParsedProposal[] {
  const freshMap = new Map<string, ParsedProposal>();
  for (const p of freshProposals) {
    freshMap.set(p.id, p);
  }

  const cachedIds = new Set(cachedProposals.map((p) => p.id));
  const merged: ParsedProposal[] = [];

  for (const cached of cachedProposals) {
    if (isProposalFinalized(cached.state)) {
      merged.push(cached);
    } else {
      const fresh = freshMap.get(cached.id);
      merged.push(fresh ?? cached);
    }
  }

  for (const fresh of freshProposals) {
    if (!cachedIds.has(fresh.id)) {
      merged.push(fresh);
    }
  }

  return merged;
}

/**
 * Sort proposals by state and start block
 *
 * Active proposals come first, then sorted by start block descending.
 *
 * @param proposals - Array of proposals to sort
 * @returns Sorted array of proposals
 */
export function sortProposals(proposals: ParsedProposal[]): ParsedProposal[] {
  return [...proposals].sort((a, b) => {
    if (a.state === "Active" && b.state !== "Active") return -1;
    if (a.state !== "Active" && b.state === "Active") return 1;
    return parseInt(b.startBlock, 10) - parseInt(a.startBlock, 10);
  });
}
