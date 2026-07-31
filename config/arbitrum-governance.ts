/**
 * Arbitrum Governance Contract Configuration
 *
 * Contains addresses for all governance-related contracts on Arbitrum and Ethereum mainnet
 */

import { env } from "@/env";
import type { ChunkingConfig } from "@/types/proposal-stage";
import { ADDRESSES } from "@gzeoneth/gov-tracker";

export const ARBITRUM_CHAIN_ID = 42161;

/** Public Arbitrum One RPC URL — used as a fallback when a private RPC fails */
export const ARBITRUM_PUBLIC_RPC_URL = "https://arb1.arbitrum.io/rpc";

/** Default Arbitrum One RPC URL */
export const ARBITRUM_RPC_URL = env.NEXT_PUBLIC_ALCHEMY_API_KEY
  ? `https://arb-mainnet.g.alchemy.com/v2/${env.NEXT_PUBLIC_ALCHEMY_API_KEY}`
  : ARBITRUM_PUBLIC_RPC_URL;

/** Default Arbitrum Nova RPC URL */
export const ARBITRUM_NOVA_RPC_URL = "https://nova.arbitrum.io/rpc";

/** Public Ethereum Mainnet RPC URL — used as a fallback when a private RPC fails */
export const ETHEREUM_PUBLIC_RPC_URL = "https://eth.drpc.org";

/** Default Ethereum Mainnet RPC URL */
export const ETHEREUM_RPC_URL = env.NEXT_PUBLIC_ALCHEMY_API_KEY
  ? `https://eth-mainnet.g.alchemy.com/v2/${env.NEXT_PUBLIC_ALCHEMY_API_KEY}`
  : ETHEREUM_PUBLIC_RPC_URL;

/**
 * Core Governor Contract (Constitutional Proposals)
 * ~42-44 day lifecycle
 */
const CORE_GOVERNOR = {
  address: ADDRESSES.CONSTITUTIONAL_GOVERNOR,
  name: "Core Governor",
  description: "Constitutional and non-emergency proposals",
} as const;

/**
 * Treasury Governor Contract (Non-Constitutional Proposals)
 * ~24-27 day lifecycle (no L1 round-trip)
 */
const TREASURY_GOVERNOR = {
  address: ADDRESSES.NON_CONSTITUTIONAL_GOVERNOR,
  name: "Treasury Governor",
  description: "Treasury and funding proposals",
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
 * L2 timelock waiting period, in days, per the Arbitrum Constitution (Section 2,
 * Phase 4): a 3-day waiting period for DAO Treasury actions (non-Constitutional)
 * and an 8-day waiting period for L2-to-L1 messages (Constitutional).
 *
 * Note: gov-tracker's getStageMetadata reports the Constitutional (8-day) value
 * for every proposal regardless of type, so the treasury value must be applied
 * explicitly for Treasury Governor proposals.
 */
export const L2_TIMELOCK_DAYS = {
  constitutional: 8,
  treasury: 3,
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
 * Governor voting period, in governor-clock blocks.
 *
 * Both governors report `votingPeriod() == 100800` (read on-chain 2026-07-31).
 * The governor clock is the L1 Ethereum block number, because Arbitrum's
 * `block.number` returns it, so this is 100800 * 12s = 14 days. `proposalDeadline()`
 * can exceed `proposalSnapshot() + this` by up to 2 days when
 * `GovernorPreventLateQuorum` extends a vote that reached quorum late.
 *
 * Governance can change this with `setVotingPeriod`. Nothing user-facing is
 * derived from it: it only sizes the window that decides which Defeated
 * proposals are worth re-reading from the chain.
 */
export const GOVERNOR_VOTING_PERIOD_BLOCKS = 100_800;

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
