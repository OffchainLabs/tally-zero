import { GOVERNORS } from "@/config/governors";
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

const { targets, values, calldatas } = normalizeActions(draft.actions);
export const proposalId = computeProposalId(
  targets,
  values,
  calldatas,
  draft.description
);

export function receipt(
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
