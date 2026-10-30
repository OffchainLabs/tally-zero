/**
 * Timing and snapshot facts for an L1 voting proposal's detail page.
 *
 * The L1 voting governor counts time in Ethereum blocks, like the Arbitrum One
 * governors, but its snapshot is locked separately: until then nobody can vote,
 * and once locked, voting power is Arbitrum state as of the confirmed assertion
 * the lock proved against.
 */

import { LOCAL_L1_CHAIN_ID } from "@/config/chains";
import { MS_PER_SECOND } from "@/lib/date-utils";
import { getL1DisplayState, type L1DisplayStatus } from "@/lib/lifecycle-utils";
import { getStateName, normalizeProposalStateName } from "@/lib/state-utils";
import type { TallyProposalIndexEntry } from "@/lib/tally-data/types";
import type { ProposalStateName } from "@/types/proposal";

/** Seconds per block: Ethereum's 12, and the local anvil's 1 */
export function l1BlockTimeSeconds(chainId: number): number {
  return chainId === LOCAL_L1_CHAIN_ID ? 1 : 12;
}

/** When a block was (or will be) mined, extrapolated from the current one */
export function estimateL1BlockDate(
  block: number,
  currentBlock: number,
  chainId: number,
  nowMs = Date.now()
): Date {
  return new Date(
    nowMs + (block - currentBlock) * l1BlockTimeSeconds(chainId) * MS_PER_SECOND
  );
}

export interface L1VotingDeadline {
  deadlineBlock: number;
  /** Blocks until the deadline; 0 once it has passed */
  blocksRemaining: number;
  /** Estimated from the block time; exact only once the block is mined */
  estimatedAt: Date;
  hasEnded: boolean;
}

export function getL1VotingDeadline(
  deadlineBlock: number,
  currentBlock: number,
  chainId: number,
  nowMs = Date.now()
): L1VotingDeadline {
  return {
    deadlineBlock,
    blocksRemaining: Math.max(0, deadlineBlock - currentBlock),
    estimatedAt: estimateL1BlockDate(
      deadlineBlock,
      currentBlock,
      chainId,
      nowMs
    ),
    hasEnded: currentBlock > deadlineBlock,
  };
}

/** What the locked snapshot means for voting power, for the given chain */
export function snapshotLockExplanation(chainId: number): string {
  const lag =
    chainId === LOCAL_L1_CHAIN_ID
      ? "on the local testnode, assertions confirm within minutes"
      : "about a week earlier on mainnet, since an assertion confirms only after the challenge period";
  return `Voting power is Arbitrum state as of the confirmed assertion at the lock (${lag}).`;
}

/**
 * The governor's state, read from L1 when the read has arrived, else the
 * indexer's. The read wins because the indexer lags the chain.
 */
export function resolveL1ProposalState(
  onChainState: number | undefined,
  indexedState: string | null | undefined
): ProposalStateName {
  if (onChainState !== undefined) {
    return normalizeProposalStateName(getStateName(onChainState));
  }
  return normalizeProposalStateName(indexedState);
}

/** What the detail page shows for a proposal, whichever sources answered. */
export interface L1ProposalView {
  display: L1DisplayStatus;
  description: string;
  snapshotBlock: number;
  snapshotLocked: boolean;
  quorum: string | null;
  /** The indexer was unreachable: shown from Ethereum alone, without tallies or stages. */
  fromChainOnly: boolean;
  /** The text and actions were read from Ethereum and hash to the proposal id. */
  verified: boolean;
  /** The indexer's description differs from what was proposed on Ethereum. */
  mismatch: boolean;
  /** Why voting is disabled, or null. Voting needs the proposal confirmed on Ethereum first. */
  voteBlocked: string | null;
}

/**
 * One view of an L1 proposal from the indexer's entry, the governor's own state, and the proposal
 * as verified on Ethereum. The text is always Ethereum's once verified; the indexer only adds
 * tallies, phases and quorum. Null when neither the indexer nor Ethereum knows the proposal.
 */
export function l1ProposalView({
  proposalId,
  entry,
  onChain,
  verified,
  verifyError,
}: {
  proposalId: string;
  entry: Pick<
    TallyProposalIndexEntry,
    | "state"
    | "executionPhase"
    | "executionCancelled"
    | "description"
    | "snapshotBlock"
    | "snapshotLocked"
    | "quorum"
  > | null;
  onChain: { state?: number; snapshotBlock?: number; snapshotLocked?: boolean };
  verified: { description: string; startBlock: bigint } | undefined;
  verifyError: string | null;
}): L1ProposalView | null {
  if (!entry && !verified) return null;
  const mismatch =
    !!verified &&
    entry?.description != null &&
    entry.description !== verified.description;
  return {
    display: getL1DisplayState(
      resolveL1ProposalState(onChain.state, entry?.state),
      entry?.executionPhase,
      entry?.executionCancelled ?? false
    ),
    description:
      verified?.description ?? entry?.description ?? `Proposal ${proposalId}`,
    snapshotBlock:
      onChain.snapshotBlock ??
      entry?.snapshotBlock ??
      Number(verified?.startBlock ?? 0),
    snapshotLocked: onChain.snapshotLocked ?? Boolean(entry?.snapshotLocked),
    quorum: entry?.quorum ?? null,
    fromChainOnly: !entry,
    verified: !!verified && !mismatch,
    mismatch,
    voteBlocked: verifyError
      ? `Could not confirm this proposal's content on Ethereum (${verifyError}), so voting is disabled.`
      : mismatch
        ? "The indexer's description differs from the proposal on Ethereum, so voting is disabled."
        : !verified
          ? "Checking the proposal's content on Ethereum…"
          : null,
  };
}
