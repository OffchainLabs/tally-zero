/**
 * Storage keys and cache configuration for TallyZero
 * Defines localStorage keys, cache TTLs, and timing constants
 */

import {
  MS_PER_HOUR,
  MS_PER_MINUTE,
  MS_PER_SECOND,
  SECONDS_PER_DAY,
  SECONDS_PER_HOUR,
  SECONDS_PER_MINUTE,
} from "@/lib/date-utils";

/** Common prefix for all TallyZero localStorage keys */
export const STORAGE_PREFIX = "tally-zero";

/** LocalStorage key identifiers for user settings and cached data */
export const STORAGE_KEYS = {
  L1_RPC: "tally-zero-l1-rpc",
  L2_RPC: "tally-zero-l2-rpc",
  BLOCK_RANGE: "tally-zero-block-range",
  L1_BLOCK_RANGE: "tally-zero-l1-block-range",
  STAGES_CACHE_PREFIX: "tally-zero-stages-",
  TIMELOCK_OP_CACHE_PREFIX: "tally-zero-timelock-op-",
  CHECKPOINT_CACHE_PREFIX: "tally-zero-checkpoint-",
  DAYS_TO_SEARCH: "tally-zero-days-to-search",
  NERD_MODE: "tally-zero-nerd-mode",
  DEBUG_LOGGING: "tally-zero-debug-logging",
  CACHE_TTL: "tally-zero-cache-ttl",
  SKIP_BUNDLED_CACHE: "tally-zero-skip-bundled-cache",
  SKIP_DELEGATE_CACHE: "tally-zero-skip-delegate-cache",
  DELEGATE_MIN_POWER: "tally-zero-delegate-min-power",
  TENDERLY_ORG: "tally-zero-tenderly-org",
  TENDERLY_PROJECT: "tally-zero-tenderly-project",
  TENDERLY_ACCESS_TOKEN: "tally-zero-tenderly-access-token",
  LAST_CACHE_VERSION: "tally-zero-last-cache-version",
} as const;

/** Default Tenderly organization placeholder */
export const DEFAULT_TENDERLY_ORG = "ORG";

/** Default Tenderly project placeholder */
export const DEFAULT_TENDERLY_PROJECT = "PROJECT";

/** Current cache schema version for migration detection */
export const CACHE_VERSION = 3;

/** Default cache time-to-live in milliseconds */
export const DEFAULT_CACHE_TTL_MS = MS_PER_HOUR;

/** Duration to show copy success feedback in milliseconds */
export const COPY_SUCCESS_TIMEOUT_MS = 2000;

/** Interval for checking cache TTL expiration in milliseconds */
export const CACHE_TTL_CHECK_INTERVAL_MS = 30 * MS_PER_SECOND;

/** Interval for refreshing L1 block number in milliseconds */
export const L1_BLOCK_REFRESH_INTERVAL_MS = MS_PER_MINUTE;

/** Duration that a cached L1 block number is considered fresh in milliseconds */
export const L1_BLOCK_CACHE_FRESHNESS_MS = 30 * MS_PER_SECOND;

/** Available cache TTL options for user settings (values in seconds) */
export const CACHE_TTL_OPTIONS = [
  { label: "15 min", value: 15 * SECONDS_PER_MINUTE },
  { label: "30 min", value: 30 * SECONDS_PER_MINUTE },
  { label: "1 hour", value: SECONDS_PER_HOUR },
  { label: "2 hours", value: 2 * SECONDS_PER_HOUR },
  { label: "6 hours", value: 6 * SECONDS_PER_HOUR },
  { label: "24 hours", value: SECONDS_PER_DAY },
] as const;

/** Bundled cache initialization settings */
export const BUNDLED_CACHE_BATCH_SIZE = 50;
export const BUNDLED_CACHE_MAX_RETRIES = 3;
export const BUNDLED_CACHE_RETRY_DELAY_MS = 100;
