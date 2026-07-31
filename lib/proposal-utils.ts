import {
  IN_FLIGHT_PROPOSAL_STATES,
  normalizeProposalStateName,
} from "@/lib/state-utils";
import type { ParsedProposal } from "@/types/proposal";
import { GOVERNOR_VOTING_PERIOD_BLOCKS } from "@config/arbitrum-governance";
import { BLOCKS_PER_DAY } from "@config/block-times";

/**
 * How long after a proposal's voting period ends a `Defeated` verdict is still
 * worth challenging against the governor contract, in governor-clock (L1)
 * blocks.
 *
 * A late-quorum extension only moves the deadline by up to 2 days, so 7 days is
 * a generous margin. Past it, `Defeated` is treated as final: re-reading every
 * historic defeat on each page load would cost three governor calls per row for
 * an answer that cannot change.
 */
const DEFEAT_RECHECK_WINDOW_DAYS = 7;
const DEFEAT_RECHECK_WINDOW_BLOCKS =
  DEFEAT_RECHECK_WINDOW_DAYS * BLOCKS_PER_DAY.ethereum;

/** The fields needed to decide whether a proposal's state is trustworthy */
type ProposalStateSource = {
  state: string | null | undefined;
  /** Vote snapshot block on the governor clock (`proposalSnapshot`) */
  startBlock?: string | null;
  /** Scheduled vote end block; "0" when the indexer did not supply one */
  endBlock?: string | null;
};

function parseBlockNumber(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/**
 * The block the voting period was scheduled to end on, on the governor clock.
 *
 * Prefers the proposal's own `endBlock` (present on RPC-derived proposals, which
 * read it from the `ProposalCreated` event). The indexer index carries no end
 * block, so fall back to `snapshot + votingPeriod`, which is the same scheduled
 * end the indexer itself computes.
 *
 * Note this is the *scheduled* end, not `proposalDeadline()`: reading the real
 * deadline is a per-proposal RPC call, which is the cost this window exists to
 * avoid.
 */
export function getScheduledVoteEndBlock({
  startBlock,
  endBlock,
}: ProposalStateSource): number | null {
  const end = parseBlockNumber(endBlock);
  if (end !== null) return end;

  const start = parseBlockNumber(startBlock);
  return start === null ? null : start + GOVERNOR_VOTING_PERIOD_BLOCKS;
}

/**
 * Whether a proposal's state should be re-read from the governor contract
 * rather than trusted as the indexer reported it.
 *
 * `Pending` / `Active` / `Unknown` are always re-read; they are in flight.
 *
 * `Defeated` is re-read only while the voting period ended within the last
 * {@link DEFEAT_RECHECK_WINDOW_DAYS} days (or has not ended yet). It needs
 * checking at all because it is the one final-looking state a deadline
 * miscalculation can fabricate: `state()` returns Defeated once the clock passes
 * `proposalDeadline()`, and `GovernorPreventLateQuorum` pushes that deadline out
 * by up to 2 days when quorum arrives late. An indexer working from the
 * `ProposalCreated` event's scheduled `endBlock` therefore reports Defeated
 * while the extended vote is still Active.
 *
 * Every other state requires an on-chain event (Canceled, Queued, Executed) or a
 * settled tally (Succeeded, Expired) to be reached, so it cannot flip back.
 *
 * @param proposal - State plus the blocks needed to locate the voting period
 * @param currentGovernorBlock - Current governor-clock block, i.e. the L1 block
 *   height. When null the window cannot be evaluated, so `Defeated` is left
 *   alone until the L1 head is known.
 */
export function needsOnChainStateRefresh(
  proposal: ProposalStateSource,
  currentGovernorBlock: number | null
): boolean {
  const state = normalizeProposalStateName(proposal.state);

  if (state !== "Defeated") {
    return IN_FLIGHT_PROPOSAL_STATES.includes(state);
  }

  if (currentGovernorBlock === null) return false;

  const scheduledEnd = getScheduledVoteEndBlock(proposal);
  if (scheduledEnd === null) return false;

  return currentGovernorBlock - scheduledEnd <= DEFEAT_RECHECK_WINDOW_BLOCKS;
}

/** Progress of the background pass that verifies indexed states on-chain */
export type StateVerificationProgress = {
  /** Current governor-clock (L1) block, null until it resolves */
  currentGovernorBlock: number | null;
  /** Whether the governor clock lookup is still in flight */
  governorClockPending: boolean;
  /** Whether the background reconciliation pass has completed */
  reconciled: boolean;
  /** Whether reconciliation gave up, leaving the indexed state as the best answer */
  reconcileFailed: boolean;
};

/**
 * Whether a proposal's state is still awaiting confirmation from the governor
 * and should therefore not be rendered yet.
 *
 * Only `Defeated` qualifies. It is the state the indexer can be wrong about
 * (see {@link needsOnChainStateRefresh}), and showing it on load means a row can
 * read "Defeated" for a second and then flip to "Active" once the governor
 * answers. The in-flight states are not withheld: `Pending` / `Active` are
 * accurate enough to show immediately and only their tallies move.
 *
 * Falls back to showing the indexed state as soon as there is no better answer
 * coming: once reconciliation finishes, once it fails, or when the governor clock
 * is unavailable so the recheck window cannot be evaluated at all.
 */
export function isProposalStateUnverified(
  proposal: ProposalStateSource,
  {
    currentGovernorBlock,
    governorClockPending,
    reconciled,
    reconcileFailed,
  }: StateVerificationProgress
): boolean {
  if (normalizeProposalStateName(proposal.state) !== "Defeated") return false;
  if (reconciled || reconcileFailed) return false;

  // The window needs the clock. While it is still loading, withhold rather than
  // flash a state that a moment later turns out to have been worth rechecking.
  if (governorClockPending) return true;

  return needsOnChainStateRefresh(proposal, currentGovernorBlock);
}

export function isIncompleteProposalState(
  state: string | null | undefined
): boolean {
  const normalizedState = state?.toLowerCase();

  return (
    normalizedState === "unknown" ||
    normalizedState === "pending" ||
    normalizedState === "active" ||
    normalizedState === "queued"
  );
}

function isPlaceholderDescription(
  description: string | undefined,
  proposalId: string
): boolean {
  if (!description) return true;
  return description.trim() === `Proposal ${proposalId}`;
}

function hasRichProposalMetadata(proposal: ParsedProposal | null): boolean {
  if (!proposal) return false;

  return (
    !isPlaceholderDescription(proposal.description, proposal.id) &&
    proposal.proposer !== "Unknown" &&
    proposal.targets.length > 0
  );
}

export function mergeProposalData(
  staticProposal: ParsedProposal | null,
  liveProposal: ParsedProposal | null
): ParsedProposal | null {
  if (!staticProposal) return liveProposal;
  if (!liveProposal) return staticProposal;

  const preferredMetadata = hasRichProposalMetadata(liveProposal)
    ? liveProposal
    : staticProposal;

  return {
    ...preferredMetadata,
    state: liveProposal.state,
    votes: liveProposal.votes ?? preferredMetadata.votes,
    contractAddress:
      liveProposal.contractAddress || preferredMetadata.contractAddress,
    governorName: liveProposal.governorName || preferredMetadata.governorName,
    networkId: liveProposal.networkId || preferredMetadata.networkId,
    startBlock: liveProposal.startBlock || preferredMetadata.startBlock,
    endBlock: liveProposal.endBlock || preferredMetadata.endBlock,
    creationTxHash:
      liveProposal.creationTxHash || preferredMetadata.creationTxHash,
    stages: preferredMetadata.stages,
    timelockLink: preferredMetadata.timelockLink,
  };
}
