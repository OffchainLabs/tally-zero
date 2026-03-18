/**
 * Delegate type definitions — re-exported from gov-tracker SDK
 * with local extensions for UI display.
 */

export type {
  DelegateCache,
  DelegateInfo,
  DelegateNotVoted,
} from "@gzeoneth/gov-tracker";

/**
 * Statistics about the delegate cache for display.
 * Extends SDK's DelegateCacheStats with UI-specific fields.
 */
export interface DelegateCacheStats {
  totalDelegates: number;
  snapshotBlock: number;
  generatedAt: Date;
  age: string;
  totalVotingPower: string;
  totalSupply: string;
}
