import { decodeEventLog, parseAbiItem, type TransactionReceipt } from "viem";

import { GOVERNORS } from "@/config/governors";
import { fromDraftGovernorType } from "@/lib/drafts/mapping";
import { computeProposalId, normalizeActions } from "@/lib/propose-utils";
import type { Draft, DraftSubmission } from "@/lib/siwe/types";

const proposalCreatedEvent = parseAbiItem(
  "event ProposalCreated(uint256 proposalId, address proposer, address[] targets, uint256[] values, string[] signatures, bytes[] calldatas, uint256 startBlock, uint256 endBlock, string description)"
);

/** Derive submission details from the confirmed governor event, not user input. */
export function submissionFromReceipt(
  receipt: TransactionReceipt,
  governorAddress: string,
  predictedProposalId: string
): DraftSubmission | null {
  if (receipt.status !== "success") return null;

  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== governorAddress.toLowerCase()) continue;
    try {
      const event = decodeEventLog({
        abi: [proposalCreatedEvent],
        data: log.data,
        topics: log.topics,
      });
      if (
        event.eventName === "ProposalCreated" &&
        event.args.proposalId.toString() === predictedProposalId
      ) {
        return {
          transactionHash: receipt.transactionHash,
          governorAddress,
          proposalId: event.args.proposalId.toString(),
        };
      }
    } catch {
      // Other logs from the same governor are irrelevant.
    }
  }

  return null;
}

/** A changed form may be submitted, but it must not submit the frozen draft. */
export function submissionMatchesPublishedDraft(
  draft: Draft,
  submission: DraftSubmission
): boolean {
  if (draft.status !== "published") return false;
  const governor = GOVERNORS[fromDraftGovernorType(draft.governorType)];
  if (
    submission.governorAddress.toLowerCase() !== governor.address.toLowerCase()
  ) {
    return false;
  }

  try {
    const { targets, values, calldatas } = normalizeActions(draft.actions);
    return (
      computeProposalId(targets, values, calldatas, draft.description) ===
      submission.proposalId
    );
  } catch {
    return false;
  }
}
