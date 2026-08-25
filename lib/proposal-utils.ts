import { isCoreGovernor } from "@/config/governors";
import {
  ADVANCEABLE_PROPOSAL_STATES,
  normalizeProposalStateName,
} from "@/lib/state-utils";
import type { ParsedProposal } from "@/types/proposal";
import { GOVERNOR_VOTING_PERIOD_BLOCKS } from "@config/arbitrum-governance";
import { BLOCKS_PER_DAY } from "@config/block-times";

/**
 * How far back a proposal can have started and still be moving through its
 * lifecycle, in days.
 *
 * A Core proposal takes about 38 days from creation to a redeemed retryable
 * (3 voting delay + 14 voting + 8 L2 timelock + ~7 L2-to-L1 challenge + 3 L1
 * timelock), and nobody queues or executes the moment they are able to, so 75
 * days is a generous cover.
 *
 * Shared with the RPC scan in `useMultiGovernorSearch`, which reads
 * `ProposalCreated` logs over the same window: the rows inside it are exactly
 * the ones that get a creation transaction hash, and therefore the only ones
 * whose lifecycle can be traced.
 */
export const LIFECYCLE_WINDOW_DAYS = 75;
const LIFECYCLE_WINDOW_BLOCKS = LIFECYCLE_WINDOW_DAYS * BLOCKS_PER_DAY.ethereum;

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
  /** Governor contract address, which decides whether an L1 round trip follows */
  contractAddress?: string | null;
  /** Present once the row can be traced, from the indexer or the RPC scan */
  creationTxHash?: string | null;
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
 * Every state the governor can still move the proposal out of is re-read: the
 * in-flight ones (`Pending` / `Active` / `Unknown`) and the two post-vote ones
 * (`Succeeded` / `Queued`), which advance whenever someone calls `queue()` or
 * `execute()`. See {@link ADVANCEABLE_PROPOSAL_STATES}.
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
 * `Canceled`, `Expired` and `Executed` are the only remaining states, and the
 * governor never leaves them, so they are taken as reported.
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
    return ADVANCEABLE_PROPOSAL_STATES.includes(state);
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
  /** Whether the governor has answered for the states that needed re-reading */
  statesRefreshed: boolean;
  /** Whether the background reconciliation pass has completed */
  reconciled: boolean;
  /** Whether reconciliation gave up, leaving the indexed state as the best answer */
  reconcileFailed: boolean;
};

/**
 * Whether a proposal's state is still awaiting confirmation from the governor
 * and should therefore not be rendered yet.
 *
 * A row whose status is about to be corrected should show a loading placeholder,
 * not a sequence of answers. Reading "Queued", then "Executed", then "Executing"
 * over a few seconds tells the reader less than showing nothing would, and it
 * looks like the page cannot make up its mind.
 *
 * Three cases qualify, all of them bounded to the rows that can actually change:
 *
 * - `Defeated`, inside the recheck window. It is the one final-looking state a
 *   deadline miscalculation can fabricate (see {@link needsOnChainStateRefresh}).
 * - `Succeeded` and `Queued`, which `queue()` and `execute()` advance without
 *   the indexer necessarily having seen it.
 * - `Executed` on the Core Governor, for a proposal recent enough to still be in
 *   its L1 round trip. That row is about to be traced, and the trace is what
 *   decides between `Executed` and `Executing`.
 *
 * `Pending` and `Active` are shown immediately, as before: they are accurate
 * enough on arrival and only their tallies move. Everything else is terminal.
 *
 * Each case waits only on the half of the pass that answers it. A state
 * question is settled by the governor read, which is one multicall; only the
 * `Executed` case waits for the whole pass, because what it is really waiting
 * for is the creation transaction hash the log scan discovers, without which
 * the lifecycle cannot be traced at all.
 *
 * Falls back to showing the indexed state as soon as there is no better answer
 * coming: once its half of the pass finishes, once the pass fails, or when the
 * governor clock is unavailable so the windows cannot be evaluated at all.
 */
export function isProposalStateUnverified(
  proposal: ProposalStateSource,
  {
    currentGovernorBlock,
    governorClockPending,
    statesRefreshed,
    reconciled,
    reconcileFailed,
  }: StateVerificationProgress
): boolean {
  if (reconcileFailed) return false;

  const state = normalizeProposalStateName(proposal.state);

  if (state === "Executed") {
    // The wait here is for a creation transaction to trace with. Once the row
    // has one, whether from the indexer or from the scan, the trace takes over
    // and reports its own progress; see `isResolving`.
    if (reconciled || proposal.creationTxHash) return false;
    return isWithinLifecycleWindow(proposal, currentGovernorBlock);
  }

  if (statesRefreshed || reconciled) return false;

  if (state === "Succeeded" || state === "Queued") return true;

  if (state !== "Defeated") return false;

  // The window needs the clock. While it is still loading, withhold rather than
  // flash a state that a moment later turns out to have been worth rechecking.
  if (governorClockPending) return true;

  return needsOnChainStateRefresh(proposal, currentGovernorBlock);
}

/**
 * Whether a Core Governor proposal is recent enough that its L1 round trip
 * could still be running, which is what makes its `Executed` worth withholding.
 *
 * Measured from the vote snapshot, the only timestamp-like field an indexer row
 * carries, against {@link LIFECYCLE_WINDOW_DAYS}: the same window the RPC scan
 * covers, so this withholds exactly the rows that scan is about to hand a
 * creation transaction to. Older Core rows, and every Treasury row, render
 * immediately; a Treasury proposal never leaves L2, so its `Executed` is final.
 */
function isWithinLifecycleWindow(
  { startBlock, contractAddress }: ProposalStateSource,
  currentGovernorBlock: number | null
): boolean {
  if (!contractAddress || !isCoreGovernor(contractAddress)) return false;
  if (currentGovernorBlock === null) return false;

  const snapshot = parseBlockNumber(startBlock);
  if (snapshot === null) return false;

  return currentGovernorBlock - snapshot <= LIFECYCLE_WINDOW_BLOCKS;
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
