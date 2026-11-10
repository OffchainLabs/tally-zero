/**
 * Zod validation schemas for forms and data validation
 * Provides runtime validation for user inputs and proposal data
 */

import { VOTE_SUPPORT } from "@gzeoneth/gov-tracker";

import { ETH_ADDRESS_REGEX } from "@/lib/address-utils";
import { twitterHandleSchema } from "@/lib/election-profile";
import type { CandidateProfileFields } from "@/lib/siwe/types";
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

/** A free-text field where a blank input means "not set". */
const optionalTextSchema = z
  .string()
  .trim()
  .transform((value) => (value === "" ? null : value));

/**
 * Schema for the candidate profile editor. Takes the form's strings and
 * outputs the fields the indexer stores.
 */
export const candidateProfileFormSchema = z.object({
  name: z.string().trim().min(1, "A name is required."),
  title: optionalTextSchema,
  // Stored as a bare handle, so a pasted profile URL or "@handle" is reduced
  // to the handle the contender page builds its link from.
  twitter: z
    .string()
    .transform((value) => (value.trim() === "" ? null : value))
    .pipe(twitterHandleSchema.nullable()),
  type: optionalTextSchema,
  representative: optionalTextSchema,
  motivation: optionalTextSchema,
  experience: optionalTextSchema,
  // Comma-separated in the form, `string[]` on the wire.
  skills: z.string().transform((value) => {
    const skills = value
      .split(",")
      .map((skill) => skill.trim())
      .filter((skill) => skill !== "");
    return skills.length > 0 ? skills : null;
  }),
  projects: optionalTextSchema,
  country: optionalTextSchema,
}) satisfies z.ZodType<CandidateProfileFields, unknown>;
