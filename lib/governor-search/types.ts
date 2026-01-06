/**
 * Governor search type definitions
 *
 * Provides types for multi-governor proposal search including
 * search options, cache information, results, and search planning.
 */

import type { ProposalCache } from "@/lib/proposal-cache";
import type { ParsedProposal, Proposal } from "@/types/proposal";

/**
 * Options for multi-governor search hook
 */
export interface UseMultiGovernorSearchOptions {
  /** Number of days back to search for proposals */
  daysToSearch: number;
  /** Whether the search should be enabled */
  enabled: boolean;
  /** Custom RPC URL to use instead of default */
  customRpcUrl?: string;
  /** Block range size for chunked queries */
  blockRange?: number;
  /** Whether to skip using the prebuilt cache */
  skipCache?: boolean;
}

/**
 * Information about cache usage
 */
export interface CacheHitInfo {
  /** Whether the cache was successfully loaded */
  loaded: boolean;
  /** Block number when cache was generated */
  snapshotBlock: number;
  /** Starting block of cached data */
  cacheStartBlock: number;
  /** Number of proposals loaded from cache */
  cachedCount: number;
  /** Number of proposals fetched fresh from RPC */
  freshCount: number;
  /** Whether cache was used in this search */
  cacheUsed: boolean;
  /** Human-readable description of search range */
  rangeInfo?: string;
}

/**
 * Result from multi-governor search hook
 */
export interface UseMultiGovernorSearchResult {
  /** Array of found proposals */
  proposals: ParsedProposal[];
  /** Search progress percentage (0-100) */
  progress: number;
  /** Error if search failed */
  error: Error | null;
  /** Whether search is currently in progress */
  isSearching: boolean;
  /** Whether the RPC provider is ready */
  isProviderReady: boolean;
  /** Information about cache usage */
  cacheInfo?: CacheHitInfo;
}

/**
 * Range of blocks to search
 */
export interface BlockRange {
  /** Starting block number */
  start: number;
  /** Ending block number */
  end: number;
}

/**
 * Search plan with RPC ranges and cache filter
 */
export interface SearchPlan {
  /** Block ranges to query via RPC */
  rpcRanges: BlockRange[];
  /** Whether to use the prebuilt cache */
  useCache: boolean;
  /** Block range filter for cached proposals */
  cacheFilter?: { minBlock: number; maxBlock: number };
  /** Human-readable description of search range */
  rangeInfo: string;
}

export type { ParsedProposal, Proposal, ProposalCache };
