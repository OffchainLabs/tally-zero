/* eslint-disable no-process-env */
import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {},
  client: {
    NEXT_PUBLIC_REOWN_PROJECT_ID: z.string().min(1),
    NEXT_PUBLIC_POSTHOG_TOKEN: z.string().min(1).optional(),
    NEXT_PUBLIC_POSTHOG_HOST: z.string().url().optional(),
    NEXT_PUBLIC_ALCHEMY_API_KEY: z.string().min(1).optional(),
    // SIWE message chainId the indexer requires (42161 prod, 412346 local e2e).
    NEXT_PUBLIC_SIWE_CHAIN_ID: z.coerce.number().int().positive().optional(),
    // "1" registers the local testnode chains (L1 1337, L2 412346) and makes
    // them the L1 voting and L2 governance chains. Off in production.
    NEXT_PUBLIC_LOCAL_CHAINS: z.enum(["0", "1"]).optional(),
    NEXT_PUBLIC_LOCAL_L1_RPC: z.string().url().optional(),
    NEXT_PUBLIC_LOCAL_L2_RPC: z.string().url().optional(),
    // The local testnode's L1 voting governor, so the L1 voting deployment can be read from the
    // chain without the indexer (production pins its addresses in the library instead).
    NEXT_PUBLIC_LOCAL_L1_VOTING_GOVERNOR: z
      .string()
      .regex(/^0x[0-9a-fA-F]{40}$/)
      .optional(),
    // Where the Lifecycle stages come from: gov-tracker's on-chain trace, or
    // the indexer's /stages endpoint. L1 voting proposals always use the
    // indexer, since gov-tracker cannot trace them.
    NEXT_PUBLIC_STAGES_SOURCE: z
      .enum(["indexer", "gov-tracker"])
      .default("gov-tracker"),
    // Safe Transaction Service for a Safe delegate's registration. Defaults to
    // Safe's hosted service on Arbitrum One; the local chains get one only
    // when this is set.
    NEXT_PUBLIC_SAFE_TX_SERVICE_URL: z.string().url().optional(),
  },
  runtimeEnv: {
    NEXT_PUBLIC_REOWN_PROJECT_ID: process.env.NEXT_PUBLIC_REOWN_PROJECT_ID,
    NEXT_PUBLIC_POSTHOG_TOKEN: process.env.NEXT_PUBLIC_POSTHOG_TOKEN,
    NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    NEXT_PUBLIC_ALCHEMY_API_KEY: process.env.NEXT_PUBLIC_ALCHEMY_API_KEY,
    NEXT_PUBLIC_SIWE_CHAIN_ID: process.env.NEXT_PUBLIC_SIWE_CHAIN_ID,
    NEXT_PUBLIC_LOCAL_CHAINS: process.env.NEXT_PUBLIC_LOCAL_CHAINS,
    NEXT_PUBLIC_LOCAL_L1_RPC: process.env.NEXT_PUBLIC_LOCAL_L1_RPC,
    NEXT_PUBLIC_LOCAL_L2_RPC: process.env.NEXT_PUBLIC_LOCAL_L2_RPC,
    NEXT_PUBLIC_LOCAL_L1_VOTING_GOVERNOR:
      process.env.NEXT_PUBLIC_LOCAL_L1_VOTING_GOVERNOR,
    NEXT_PUBLIC_STAGES_SOURCE: process.env.NEXT_PUBLIC_STAGES_SOURCE,
    NEXT_PUBLIC_SAFE_TX_SERVICE_URL:
      process.env.NEXT_PUBLIC_SAFE_TX_SERVICE_URL,
  },
  skipValidation: !!process.env.VITEST,
});
