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

type CreatedProposal = ParsedProposal & { createdAtBlock: number };

function hasCreationBlock(
  proposal: ParsedProposal
): proposal is CreatedProposal {
  return proposal.createdAtBlock !== undefined;
}

/**
 * Number proposals by creation order across every governor, 1 being the oldest.
 *
 * OZ Governor keeps no counter and Tally shows none, so this is the table's
 * own ordinal: creation block first, proposal id as the tiebreak so two
 * proposals from one transaction still get a stable order. Input order is
 * preserved; only `proposalNumber` changes.
 *
 * A row with no `createdAtBlock` is left unnumbered rather than placed by its
 * snapshot block. The snapshot is the governor's clock, which on Arbitrum is
 * the L1 height, while the creation block is an L2 height: the two are an
 * order of magnitude apart and ordering across them puts rows wherever the
 * mismatch lands. A blank cell, which the column already renders and
 * `sortUndefined: "last"` already places, beats a confident wrong number.
 *
 * Only meaningful over the complete list. Callers holding a recent RPC window
 * should leave `proposalNumber` unset rather than number the window.
 */
export function assignProposalNumbers(
  proposals: ParsedProposal[]
): ParsedProposal[] {
  // filter() copies, so the sort never touches the caller's array.
  const byCreation = proposals.filter(hasCreationBlock).sort((a, b) => {
    const blockDiff = a.createdAtBlock - b.createdAtBlock;
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

/**
 * Number the rows only when the list is the complete one.
 *
 * Without the indexer the cache holds a recent RPC window, and an ordinal over
 * a window would mislabel every row, so the column stays empty instead. This
 * gate is the only thing standing between the ordinal and a confident lie, so
 * it lives here where a test can reach it rather than inline in the hook.
 */
export function numberCompleteList(
  proposals: ParsedProposal[],
  indexerAvailable: boolean
): ParsedProposal[] {
  return indexerAvailable ? assignProposalNumbers(proposals) : proposals;
}
