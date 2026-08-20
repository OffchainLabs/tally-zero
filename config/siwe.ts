import { env } from "@/env";

// The chainId the indexer's SIWE surface requires in the EIP-4361 message
// (server rejects a mismatch). Arbitrum One (42161) in prod; the local
// governance testnode (412346) for local/e2e. Override with
// NEXT_PUBLIC_SIWE_CHAIN_ID.
export const SIWE_CHAIN_ID = env.NEXT_PUBLIC_SIWE_CHAIN_ID ?? 42161;
