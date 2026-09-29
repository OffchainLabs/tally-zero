import {
  encodeAbiParameters,
  encodeEventTopics,
  parseAbiItem,
  type TransactionReceipt,
} from "viem";
import { describe, expect, it } from "vitest";

import { GOVERNORS } from "@/config/governors";
import { computeProposalId, normalizeActions } from "@/lib/propose-utils";
import type { Draft } from "@/lib/siwe/types";

import {
  submissionFromReceipt,
  submissionMatchesPublishedDraft,
} from "./submission";

const governor = GOVERNORS.treasury.address as `0x${string}`;
const target = "0x2222222222222222222222222222222222222222" as const;
const author = "0x1111111111111111111111111111111111111111";
const txHash = `0x${"ab".repeat(32)}` as `0x${string}`;
const event = parseAbiItem(
  "event ProposalCreated(uint256 proposalId, address proposer, address[] targets, uint256[] values, string[] signatures, bytes[] calldatas, uint256 startBlock, uint256 endBlock, string description)"
);

const draft: Draft = {
  id: "d1",
  author,
  title: "A draft",
  description: "# A draft",
  governorType: "TREASURY",
  actions: [{ target, value: "0", calldata: "0x" }],
  status: "published",
  shareSlug: "slug",
  onchain: null,
  createdAt: "2026-09-01T00:00:00Z",
  updatedAt: "2026-09-01T00:00:00Z",
};

const { targets, values, calldatas } = normalizeActions(draft.actions);
const proposalId = computeProposalId(
  targets,
  values,
  calldatas,
  draft.description
);

function receipt(
  overrides: {
    status?: TransactionReceipt["status"];
    address?: `0x${string}`;
    eventProposalId?: string;
  } = {}
): TransactionReceipt {
  return {
    status: overrides.status ?? "success",
    transactionHash: txHash,
    logs: [
      {
        address: overrides.address ?? governor,
        topics: encodeEventTopics({
          abi: [event],
          eventName: "ProposalCreated",
        }),
        data: encodeAbiParameters(
          [
            { type: "uint256" },
            { type: "address" },
            { type: "address[]" },
            { type: "uint256[]" },
            { type: "string[]" },
            { type: "bytes[]" },
            { type: "uint256" },
            { type: "uint256" },
            { type: "string" },
          ],
          [
            BigInt(overrides.eventProposalId ?? proposalId),
            author as `0x${string}`,
            targets,
            values,
            [],
            calldatas,
            BigInt(1),
            BigInt(2),
            draft.description,
          ]
        ),
      },
    ],
  } as TransactionReceipt;
}

describe("published draft submission", () => {
  it("takes submission details from the confirmed governor event", () => {
    const submission = submissionFromReceipt(receipt(), governor, proposalId);
    expect(submission).toEqual({
      transactionHash: txHash,
      governorAddress: governor,
      proposalId,
    });
    expect(submissionMatchesPublishedDraft(draft, submission!)).toBe(true);
  });

  it("rejects a reverted receipt, a different governor, and a different proposal", () => {
    expect(
      submissionFromReceipt(
        receipt({ status: "reverted" }),
        governor,
        proposalId
      )
    ).toBeNull();
    expect(
      submissionFromReceipt(receipt({ address: target }), governor, proposalId)
    ).toBeNull();
    expect(
      submissionFromReceipt(
        receipt({ eventProposalId: "42" }),
        governor,
        proposalId
      )
    ).toBeNull();
  });

  it("does not mark the frozen draft for a changed proposal", () => {
    const submission = submissionFromReceipt(receipt(), governor, proposalId)!;
    expect(
      submissionMatchesPublishedDraft(
        { ...draft, description: "# Changed draft" },
        submission
      )
    ).toBe(false);
    expect(
      submissionMatchesPublishedDraft(
        { ...draft, status: "submitted" },
        submission
      )
    ).toBe(false);
  });
});
