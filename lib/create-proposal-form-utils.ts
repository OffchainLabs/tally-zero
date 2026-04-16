import type { Options as ReactMarkdownOptions } from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";

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

let nextFormProposalActionId = 0;

export function createFormProposalAction(): FormProposalAction {
  return {
    id: `proposal-action-${nextFormProposalActionId++}`,
    ...emptyAction(),
  };
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
