/**
 * Arbitrum Governance Contract Configuration
 *
 * Contains addresses for all governance-related contracts on Arbitrum and Ethereum mainnet
 */

import type { ChunkingConfig } from "@/types/proposal-stage";
import { ADDRESSES } from "@gzeoneth/gov-tracker";

export const ARBITRUM_CHAIN_ID = 42161;

/** Default Arbitrum One RPC URL */
export const ARBITRUM_RPC_URL = "https://arb1.arbitrum.io/rpc";

/** Default Arbitrum Nova RPC URL */
export const ARBITRUM_NOVA_RPC_URL = "https://nova.arbitrum.io/rpc";

/** Default Ethereum Mainnet RPC URL */
export const ETHEREUM_RPC_URL = "https://eth.drpc.org";

/**
 * Core Governor Contract (Constitutional Proposals)
 * 4.5% quorum, ~42-44 day lifecycle
 */
const CORE_GOVERNOR = {
  address: ADDRESSES.CONSTITUTIONAL_GOVERNOR,
  name: "Core Governor",
  description: "Constitutional and non-emergency proposals",
  quorum: "4.5%",
} as const;

/**
 * Treasury Governor Contract (Non-Constitutional Proposals)
 * 3% quorum, ~24-27 day lifecycle (no L1 round-trip)
 */
const TREASURY_GOVERNOR = {
  address: ADDRESSES.NON_CONSTITUTIONAL_GOVERNOR,
  name: "Treasury Governor",
  description: "Treasury and funding proposals",
  quorum: "3%",
} as const;

/**
 * L2 Treasury Timelock Contract (Arbitrum One)
 * 3-day delay for Treasury Governor funding proposals
 */
export const L2_TREASURY_TIMELOCK = {
  address: ADDRESSES.L2_NON_CONSTITUTIONAL_TIMELOCK,
  name: "L2 Treasury Timelock",
  delay: "3 days",
} as const;

/**
 * L1 Timelock Contract (Ethereum Mainnet)
 * 3-day delay, only used for Core Governor proposals
 */
export const L1_TIMELOCK = {
  address: ADDRESSES.L1_TIMELOCK,
  name: "L1 Timelock",
  delay: "3 days",
} as const;

/**
 * ARB Token Contract
 */
export const ARB_TOKEN = {
  address: ADDRESSES.ARB_TOKEN,
  name: "ARB Token",
} as const;

/**
 * Combined list of all Arbitrum governors
 */
export const ARBITRUM_GOVERNORS = [
  { id: "core" as const, ...CORE_GOVERNOR },
  { id: "treasury" as const, ...TREASURY_GOVERNOR },
] as const;

/**
 * Default form values for search configuration
 * These are the single source of truth for form defaults and placeholders
 */
export const DEFAULT_FORM_VALUES = {
  daysToSearch: 120,
  blockRange: 10000000, // arb1.arbitrum.io/rpc can handle 10M block ranges
  l1BlockRange: 1000, // private L1 RPCs can handle larger ranges
} as const;

/**
 * Default chunking configuration for event searches
 * Optimized for default public RPCs (arb1.arbitrum.io, eth.drpc.org)
 */
export const DEFAULT_CHUNKING_CONFIG: ChunkingConfig = {
  l2ChunkSize: DEFAULT_FORM_VALUES.blockRange,
  l1ChunkSize: DEFAULT_FORM_VALUES.l1BlockRange,
  delayBetweenChunks: 100, // ms delay between chunk queries
};

export { L1_SECONDS_PER_BLOCK } from "@/config/block-times";
