/**
 * Arbitrum Governance Contract Configuration
 *
 * Contains addresses for all governance-related contracts on Arbitrum and Ethereum mainnet
 */

import type { ChunkingConfig } from "@/types/proposal-stage";

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
export const CORE_GOVERNOR = {
  address: "0xf07DeD9dC292157749B6Fd268E37DF6EA38395B9",
  name: "Core Governor",
  description: "Constitutional and non-emergency proposals",
  quorum: "4.5%",
} as const;

/**
 * Treasury Governor Contract (Non-Constitutional Proposals)
 * 3% quorum, ~24-27 day lifecycle (no L1 round-trip)
 */
export const TREASURY_GOVERNOR = {
  address: "0x789fC99093B09aD01C34DC7251D0C89ce743e5a4",
  name: "Treasury Governor",
  description: "Treasury and funding proposals",
  quorum: "3%",
} as const;

/**
 * L2 Core Timelock Contract (Arbitrum One)
 * 8-day delay for Core Governor constitutional proposals
 */
export const L2_CORE_TIMELOCK = {
  address: "0x34d45e99f7D8c45ed05B5cA72D54bbD1fb3F98f0",
  name: "L2 Core Timelock",
  delay: "8 days",
} as const;

/**
 * L2 Treasury Timelock Contract (Arbitrum One)
 * 3-day delay for Treasury Governor funding proposals
 */
export const L2_TREASURY_TIMELOCK = {
  address: "0xbFc1FECa8B09A5c5D3EFfE7429eBE24b9c09EF58",
  name: "L2 Treasury Timelock",
  delay: "3 days",
} as const;

/**
 * L1 Timelock Contract (Ethereum Mainnet)
 * 3-day delay, only used for Core Governor proposals
 */
export const L1_TIMELOCK = {
  address: "0xE6841D92B0C345144506576eC13ECf5103aC7f49",
  name: "L1 Timelock",
  delay: "3 days",
} as const;

/**
 * ARB Token Contract
 */
export const ARB_TOKEN = {
  address: "0x912CE59144191C1204E64559FE8253a0e49E6548",
  name: "ARB Token",
} as const;

/**
 * Combined list of all Arbitrum governors
 */
export const ARBITRUM_GOVERNORS = [
  { id: "core" as const, ...CORE_GOVERNOR },
  { id: "treasury" as const, ...TREASURY_GOVERNOR },
] as const;

/** Governor identifier type derived from ARBITRUM_GOVERNORS */
export type GovernorId = (typeof ARBITRUM_GOVERNORS)[number]["id"];

/**
 * Delayed Inbox addresses for detecting target L2 chain from L1→L2 messages
 * Used to determine if a retryable ticket targets Arbitrum One or Nova
 */
export const DELAYED_INBOX = {
  ARB1: "0x4Dbd4fc535Ac27206064B68FfCf827b0A60BAB3f",
  NOVA: "0xc4448b71118c9071Bcb9734A0EAc55D18A153949",
} as const;

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

/**
 * Proposal state names mapping
 */
export const PROPOSAL_STATE_NAMES = {
  0: "Pending",
  1: "Active",
  2: "Canceled",
  3: "Defeated",
  4: "Succeeded",
  5: "Queued",
  6: "Expired",
  7: "Executed",
} as const;

/**
 * Proposal state numeric values
 * Matches OpenZeppelin Governor ProposalState enum
 */
export const ProposalState = {
  PENDING: 0,
  ACTIVE: 1,
  CANCELED: 2,
  DEFEATED: 3,
  SUCCEEDED: 4,
  QUEUED: 5,
  EXPIRED: 6,
  EXECUTED: 7,
} as const;

/** Type for proposal state numeric values */
export type ProposalStateValue =
  (typeof ProposalState)[keyof typeof ProposalState];

/**
 * Get configuration for a specific governor type
 * @param type - The governor type ("core" or "treasury")
 * @returns Governor configuration with governor, timelock, and L1 timelock info
 */
export function getGovernorConfig(type: "core" | "treasury") {
  if (type === "core") {
    return {
      governor: CORE_GOVERNOR,
      l2Timelock: L2_CORE_TIMELOCK,
      l1Timelock: L1_TIMELOCK,
      hasL1Timelock: true,
    };
  } else {
    return {
      governor: TREASURY_GOVERNOR,
      l2Timelock: L2_TREASURY_TIMELOCK,
      l1Timelock: null,
      hasL1Timelock: false,
    };
  }
}

/**
 * Challenge period in L1 blocks (~7 days at 12s/block)
 * The older challenge period is shorter, we use that when looking up events.
 */
export const CHALLENGE_PERIOD_L1_BLOCKS = 46080;

/** Legacy challenge period in L1 blocks (used for historical event lookup) */
export const OLD_CHALLENGE_PERIOD_L1_BLOCKS = 45818;

/**
 * Maximum voting period search range in L2 blocks.
 * ~18 days including extensions at 250ms/block (4 blocks/second).
 * Used to limit log search range when finding voting-related events.
 */
export const MAX_VOTING_PERIOD_BLOCKS_L2 = 6_500_000;

export {
  BLOCK_TIMES,
  BLOCKS_PER_DAY,
  blocksToTime as blocksToTimeByChainId,
  getBlocksPerDay,
  getBlockTime,
  L1_SECONDS_PER_BLOCK,
  timeToBlocks as timeToBlocksByChainId,
} from "@/config/block-times";

import {
  blocksToTime as blocksToTimeById,
  timeToBlocks as timeToBlocksById,
} from "@/config/block-times";

/** Chain IDs for named chain conversion */
const CHAIN_IDS = { ethereum: 1, arbitrum: 42161 } as const;

/**
 * Convert time to blocks for a named chain
 * @param seconds - Duration in seconds
 * @param chain - Chain name ("ethereum" or "arbitrum")
 * @returns Number of blocks
 */
export function timeToBlocks(
  seconds: number,
  chain: "ethereum" | "arbitrum"
): number {
  return timeToBlocksById(seconds, CHAIN_IDS[chain]);
}

/**
 * Convert blocks to time for a named chain
 * @param blocks - Number of blocks
 * @param chain - Chain name ("ethereum" or "arbitrum")
 * @returns Duration in seconds
 */
export function blocksToTime(
  blocks: number,
  chain: "ethereum" | "arbitrum"
): number {
  return blocksToTimeById(blocks, CHAIN_IDS[chain]);
}
