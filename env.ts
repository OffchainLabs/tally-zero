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
  },
  runtimeEnv: {
    NEXT_PUBLIC_REOWN_PROJECT_ID: process.env.NEXT_PUBLIC_REOWN_PROJECT_ID,
    NEXT_PUBLIC_POSTHOG_TOKEN: process.env.NEXT_PUBLIC_POSTHOG_TOKEN,
    NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    NEXT_PUBLIC_ALCHEMY_API_KEY: process.env.NEXT_PUBLIC_ALCHEMY_API_KEY,
    NEXT_PUBLIC_SIWE_CHAIN_ID: process.env.NEXT_PUBLIC_SIWE_CHAIN_ID,
  },
  skipValidation: !!process.env.VITEST,
});
