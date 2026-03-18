/**
 * Zod validation schemas for forms and data validation
 * Provides runtime validation for user inputs and proposal data
 */

import { VOTE_SUPPORT } from "@gzeoneth/gov-tracker";

import { ETH_ADDRESS_REGEX } from "@/lib/address-utils";
import { isValidRpcUrl } from "@lib/utils";
import * as z from "zod";

import { DEFAULT_FORM_VALUES } from "./arbitrum-governance";

/** Schema for validating optional RPC URLs */
const rpcUrlSchema = z
  .string()
  .optional()
  .refine(
    (url) => {
      if (!url || url === "") return true;
      return isValidRpcUrl(url);
    },
    {
      message: "RPC URL must be a valid HTTP or HTTPS URL",
    }
  )
  .or(z.literal(""));

/** Schema for the main search/settings form */
export const formSchema = z.object({
  address: z.string().regex(ETH_ADDRESS_REGEX, "Invalid Ethereum address"),
  networkId: z.string(),
  daysToSearch: z
    .number()
    .min(1)
    .optional()
    .default(DEFAULT_FORM_VALUES.daysToSearch),
  rpcUrl: rpcUrlSchema,
  l1RpcUrl: rpcUrlSchema,
  blockRange: z
    .number()
    .min(100)
    .optional()
    .default(DEFAULT_FORM_VALUES.blockRange),
  l1BlockRange: z
    .number()
    .min(100)
    .optional()
    .default(DEFAULT_FORM_VALUES.l1BlockRange),
  autoRun: z.boolean().optional().default(false),
});

const VALID_VOTE_VALUES = Object.values(VOTE_SUPPORT).map(String);

/** Schema for vote submission form */
export const voteSchema = z.object({
  vote: z.string().refine((data) => VALID_VOTE_VALUES.includes(data), {
    message: "Please select a valid vote option",
  }),
});

/** Schema for validating proposal data structure */
export const proposalSchema = z.object({
  id: z.string(),
  proposer: z.string(),
  contractAddress: z.string(),
  targets: z.array(z.string()),
  values: z.array(z.string()),
  signatures: z.array(z.string()),
  calldatas: z.array(z.string()),
  startBlock: z.string(),
  endBlock: z.string(),
  description: z.string(),
  networkId: z.string(),
  state: z.string(),
  creationTxHash: z.string().optional(),
});
