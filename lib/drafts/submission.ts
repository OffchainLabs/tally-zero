import { decodeEventLog, parseAbiItem, type TransactionReceipt } from "viem";

import { GOVERNORS } from "@/config/governors";
import { fromDraftGovernorType } from "@/lib/drafts/mapping";
import { computeProposalId, normalizeActions } from "@/lib/propose-utils";
import type { Draft, DraftSubmission } from "@/lib/siwe/types";

const proposalCreatedEvent = parseAbiItem(
  "event ProposalCreated(uint256 proposalId, address proposer, address[] targets, uint256[] values, string[] signatures, bytes[] calldatas, uint256 startBlock, uint256 endBlock, string description)"
);

export type DraftReceiptCheck =
  | { kind: "match"; submission: DraftSubmission }
  | { kind: "different" | "missing" };

/** UI verification only; the indexer remains responsible for trusted records. */
export function checkDraftReceipt(
  receipt: TransactionReceipt,
  draft: Draft
): DraftReceiptCheck {
  if (receipt.status !== "success" || draft.status !== "published")
    return { kind: "missing" };
  const governorAddress =
    GOVERNORS[fromDraftGovernorType(draft.governorType)].address;
  let proposalId: string;
  try {
    const { targets, values, calldatas } = normalizeActions(draft.actions);
    proposalId = computeProposalId(
      targets,
      values,
      calldatas,
      draft.description
    );
  } catch {
    return { kind: "different" };
  }
  let sawDifferentProposal = false;

  for (const log of receipt.logs) {
    if (
      !Object.values(GOVERNORS).some(
        (governor) =>
          governor.address.toLowerCase() === log.address.toLowerCase()
      )
    )
      continue;
    try {
      const event = decodeEventLog({
        abi: [proposalCreatedEvent],
        data: log.data,
        topics: log.topics,
      });
      if (
        event.eventName === "ProposalCreated" &&
        log.address.toLowerCase() === governorAddress.toLowerCase() &&
        event.args.proposalId.toString() === proposalId
      ) {
        return {
          kind: "match",
          submission: {
            transactionHash: receipt.transactionHash,
            governorAddress,
            proposalId: event.args.proposalId.toString(),
          },
        };
      }
      sawDifferentProposal = true;
    } catch {
      // Other logs from the same governor are irrelevant.
    }
  }

  return { kind: sawDifferentProposal ? "different" : "missing" };
}
