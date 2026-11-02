/**
 * Proposal utilities
 *
 * Provides utility functions for working with proposals.
 */

import type { ParsedProposal } from "@/types/proposal";

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

function creationOrderBlock(proposal: ParsedProposal): number {
  return proposal.createdAtBlock ?? parseInt(proposal.startBlock, 10);
}

/**
 * Number proposals by creation order across every governor, 1 being the oldest.
 *
 * OZ Governor keeps no counter and Tally shows none, so this is the table's
 * own ordinal: creation block first (snapshot block when the creation block is
 * unknown), proposal id as the tiebreak so two proposals from one transaction
 * still get a stable order. Input order is preserved; only `proposalNumber`
 * changes.
 *
 * Only meaningful over the complete list. Callers holding a recent RPC window
 * should leave `proposalNumber` unset rather than number the window.
 */
export function assignProposalNumbers(
  proposals: ParsedProposal[]
): ParsedProposal[] {
  const byCreation = [...proposals].sort((a, b) => {
    const blockDiff = creationOrderBlock(a) - creationOrderBlock(b);
    if (blockDiff !== 0) return blockDiff;
    return a.id.localeCompare(b.id);
  });

  const numbers = new Map<ParsedProposal, number>();
  byCreation.forEach((proposal, index) => {
    numbers.set(proposal, index + 1);
  });

  return proposals.map((proposal) => {
    const proposalNumber = numbers.get(proposal);
    return proposal.proposalNumber === proposalNumber
      ? proposal
      : { ...proposal, proposalNumber };
  });
}
