/**
 * Governor search type definitions
 *
 * Provides types for multi-governor proposal search including
 * search options, cache information, results, and search planning.
 */

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
}

/**
 * Information about where the proposal data came from
 */
export interface ProposalSourceInfo {
  /** Whether the governance indexer responded */
  indexerAvailable: boolean;
  /** Number of proposals loaded from the indexer */
  indexedCount: number;
  /** Number of new proposals found by the background RPC gap scan */
  rpcFreshCount: number;
  /** Last block the indexer had synced when loaded */
  watermarkBlock: number;
  /** Whether the background RPC reconciliation has completed */
  reconciled: boolean;
  /** Human-readable description of search range */
  rangeInfo?: string;
}

/**
 * Result from multi-governor search hook
 */
export interface UseMultiGovernorSearchResult {
  /** Array of found proposals */
  proposals: ParsedProposal[];
  /** Blocking error: neither the indexer nor the RPC fallback could load proposals */
  error: Error | null;
  /** Whether the initial proposal list is still loading */
  isSearching: boolean;
  /** Whether the background RPC reconciliation is running */
  isReconciling: boolean;
  /** Non-blocking error from the background RPC reconciliation */
  rpcError: Error | null;
  /** Information about where the proposal data came from */
  sourceInfo?: ProposalSourceInfo;
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
 * Search plan with RPC ranges
 */
export interface SearchPlan {
  /** Block ranges to query via RPC */
  rpcRanges: BlockRange[];
  /** Human-readable description of search range */
  rangeInfo: string;
}

export type { ParsedProposal, Proposal };
