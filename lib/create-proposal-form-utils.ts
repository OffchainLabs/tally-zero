import type { Options as ReactMarkdownOptions } from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";

import type { GovernorType } from "@/config/governors";
import { buildProposalPath } from "@/lib/proposal-url";
import { emptyAction, type ProposalAction } from "@/lib/propose-utils";
import { proposalSanitizeSchema } from "@/lib/sanitize-schema";

export type ProposalEligibility = "unknown" | "meets" | "below";

export interface FormProposalAction extends ProposalAction {
  id: string;
}

export type ProposalSubmissionPhase =
  | "idle"
  | "awaiting-wallet"
  | "confirming"
  | "confirmed";

export const PROPOSAL_DRAFT_VERSION = 1;

export interface ProposalDraft {
  version: typeof PROPOSAL_DRAFT_VERSION;
  savedAt: number;
  governorType: GovernorType;
  description: string;
  actions: ProposalAction[];
}

export interface RestoredProposalDraft extends Omit<ProposalDraft, "actions"> {
  actions: FormProposalAction[];
}

let nextFormProposalActionId = 0;

export function createFormProposalAction(): FormProposalAction {
  return {
    id: `proposal-action-${nextFormProposalActionId++}`,
    ...emptyAction(),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isGovernorType(value: unknown): value is GovernorType {
  return value === "core" || value === "treasury";
}

function restoreProposalAction(action: unknown): FormProposalAction | null {
  if (!isRecord(action)) return null;

  const { target, value, calldata } = action;
  if (
    typeof target !== "string" ||
    typeof value !== "string" ||
    typeof calldata !== "string"
  ) {
    return null;
  }

  return {
    ...createFormProposalAction(),
    target,
    value,
    calldata,
  };
}

export function createProposalDraft({
  governorType,
  description,
  actions,
  savedAt = Date.now(),
}: {
  governorType: GovernorType;
  description: string;
  actions: ProposalAction[];
  savedAt?: number;
}): ProposalDraft {
  return {
    version: PROPOSAL_DRAFT_VERSION,
    savedAt,
    governorType,
    description,
    actions: actions.map(({ target, value, calldata }) => ({
      target,
      value,
      calldata,
    })),
  };
}

export function parseProposalDraft(
  raw: string | null
): RestoredProposalDraft | null {
  if (raw === null) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!isRecord(parsed)) return null;

  const { version, savedAt, governorType, description, actions } = parsed;

  if (version !== PROPOSAL_DRAFT_VERSION) return null;
  if (typeof savedAt !== "number" || !Number.isFinite(savedAt)) return null;
  if (!isGovernorType(governorType)) return null;
  if (typeof description !== "string") return null;

  const restoredActions = Array.isArray(actions)
    ? actions
        .map(restoreProposalAction)
        .filter((action): action is FormProposalAction => action !== null)
    : [];

  return {
    version,
    savedAt,
    governorType,
    description,
    actions:
      restoredActions.length > 0
        ? restoredActions
        : [createFormProposalAction()],
  };
}

/**
 * Blocks subtracted from the governance clock to get a readable snapshot.
 *
 * `ERC20Votes.getPastVotes` and `Governor.quorum` both revert ("block not yet
 * mined") unless the timepoint is strictly in the past, so the clock itself is
 * unusable and one block back is the freshest value that reads at all.
 *
 * We take three instead, to absorb skew between RPC replicas. The clock read
 * and the checkpoint reads share an endpoint but not necessarily a machine:
 * public RPCs load-balance across nodes that can be a block apart, so a clock
 * of N read from one node and a `quorum(N - 1)` served by a node still at
 * N - 1 would revert and blank the figures. A few blocks of slack costs about
 * 36 seconds of staleness in values that move over days.
 *
 * Matching OZ Governor's `propose()` threshold timepoint exactly
 * (`getVotes(proposer, block.number - 1)`) is not achievable anyway: the
 * transaction lands at a later block than the one this page reads at, so the
 * page is an estimate either way.
 */
const SNAPSHOT_LOOKBACK_BLOCKS = BigInt(3);

/**
 * Derives the block to read voting power and quorum at from the current
 * governance clock. Returns undefined while the clock is unknown, so callers
 * can gate their reads instead of querying block 0.
 */
export function getProposalSnapshotBlock(
  clockBlock: bigint | null | undefined
): bigint | undefined {
  if (clockBlock === null || clockBlock === undefined) return undefined;

  const snapshot = clockBlock - SNAPSHOT_LOOKBACK_BLOCKS;
  return snapshot > BigInt(0) ? snapshot : BigInt(0);
}

export function getProposalEligibility(
  votingPower: bigint | undefined,
  proposalThreshold: bigint | undefined
): ProposalEligibility {
  if (votingPower === undefined || proposalThreshold === undefined) {
    return "unknown";
  }

  return votingPower >= proposalThreshold ? "meets" : "below";
}

export function getProposalSubmissionPhase({
  txHash,
  isWriting,
  isConfirming,
  isConfirmed,
}: {
  txHash: string | undefined;
  isWriting: boolean;
  isConfirming: boolean;
  isConfirmed: boolean;
}): ProposalSubmissionPhase {
  if (isConfirmed && txHash) return "confirmed";
  if (isConfirming && txHash) return "confirming";
  if (isWriting) return "awaiting-wallet";
  return "idle";
}

export function buildSubmittedProposalPath({
  proposalId,
  governorAddress,
}: {
  proposalId: string | null;
  governorAddress: string | null;
}): string | null {
  if (!proposalId || !governorAddress) return null;

  return buildProposalPath({
    proposalId,
    governorAddress,
  });
}

export function getProposalPreviewRehypePlugins(): NonNullable<
  ReactMarkdownOptions["rehypePlugins"]
> {
  return [rehypeRaw, [rehypeSanitize, proposalSanitizeSchema]];
}

export function getProposalPreviewRemarkPlugins(): NonNullable<
  ReactMarkdownOptions["remarkPlugins"]
> {
  return [remarkGfm];
}
