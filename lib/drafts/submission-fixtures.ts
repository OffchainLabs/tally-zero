import { GOVERNORS } from "@/config/governors";
import { encodeCoreGovernorPayload } from "@/lib/core-governor-payload";
import { fromDraftGovernorType } from "@/lib/drafts/mapping";
import { computeProposalId, normalizeActions } from "@/lib/propose-utils";
import type { Draft } from "@/lib/siwe/types";
import {
  encodeAbiParameters,
  encodeEventTopics,
  parseAbiItem,
  type TransactionReceipt,
} from "viem";

export const governor = GOVERNORS.treasury.address as `0x${string}`;
const target = "0x2222222222222222222222222222222222222222" as const;
const author = "0x1111111111111111111111111111111111111111";
export const txHash = `0x${"ab".repeat(32)}` as `0x${string}`;
const event = parseAbiItem(
  "event ProposalCreated(uint256 proposalId, address proposer, address[] targets, uint256[] values, string[] signatures, bytes[] calldatas, uint256 startBlock, uint256 endBlock, string description)"
);

export const draft: Draft = {
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

/**
 * A Core Governor draft as this app stores it: the one ArbSys action that
 * routes its rows through the L1 timelock, which is also what `propose()`
 * receives, so the stored bytes hash to the proposal id in the receipt.
 */
const coreAction = encodeCoreGovernorPayload({
  actions: [{ chain: "ethereum", target, value: "0", calldata: "0x1cff79cd" }],
  description: "# A core draft",
});
export const coreDraft: Draft = {
  ...draft,
  id: "d2",
  title: "A core draft",
  description: "# A core draft",
  governorType: "CONSTITUTIONAL",
  actions: [
    {
      target: coreAction.target,
      value: coreAction.value.toString(),
      calldata: coreAction.calldata,
    },
  ],
};

/** What the governor emits for the draft as stored. */
export function expectedProposalId(of: Draft): string {
  const { targets, values, calldatas } = normalizeActions(of.actions);
  return computeProposalId(targets, values, calldatas, of.description);
}

export const proposalId = expectedProposalId(draft);

export function receipt(
  overrides: {
    status?: TransactionReceipt["status"];
    address?: `0x${string}`;
    eventProposalId?: string;
  } = {},
  of: Draft = draft
): TransactionReceipt {
  const { targets, values, calldatas } = normalizeActions(of.actions);
  return {
    status: overrides.status ?? "success",
    transactionHash: txHash,
    logs: [
      {
        address:
          overrides.address ??
          (GOVERNORS[fromDraftGovernorType(of.governorType)]
            .address as `0x${string}`),
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
            BigInt(overrides.eventProposalId ?? expectedProposalId(of)),
            author as `0x${string}`,
            targets,
            values,
            [],
            calldatas,
            BigInt(1),
            BigInt(2),
            of.description,
          ]
        ),
      },
    ],
  } as TransactionReceipt;
}
