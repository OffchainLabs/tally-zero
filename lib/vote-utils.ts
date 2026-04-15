/**
 * Utility functions for vote and quorum calculations.
 * Centralizes the logic used across VoteDistributionBar, QuorumIndicator, etc.
 */

import type { ProposalVotes } from "@/types/proposal";

/** Raw votes from ethers BigNumber before formatting */
export interface RawVotes {
  forVotes: { toString(): string };
  againstVotes: { toString(): string };
  abstainVotes: { toString(): string };
}

/**
 * Format raw votes from contract call into ProposalVotes structure.
 * Consolidates the common pattern of stringifying BigNumber votes.
 *
 * @param votes - Raw vote counts from contract (ethers BigNumber compatible)
 * @param quorum - Optional quorum threshold
 * @returns Formatted proposal votes
 */
export function formatVotes(votes: RawVotes, quorum?: string): ProposalVotes {
  return {
    forVotes: votes.forVotes.toString(),
    againstVotes: votes.againstVotes.toString(),
    abstainVotes: votes.abstainVotes.toString(),
    quorum,
  };
}

export interface VoteDistribution {
  forPct: number;
  againstPct: number;
  abstainPct: number;
  total: number;
  hasVotes: boolean;
}

export interface QuorumProgress {
  percentage: number;
  isReached: boolean;
  current: number;
  required: number;
}

export interface PreciseQuorumProgress {
  percentage: number;
  progressPercentage: number;
  isReached: boolean;
}

/**
 * Calculate vote distribution percentages from vote strings.
 * @param forVotes - String representation of "for" votes
 * @param againstVotes - String representation of "against" votes
 * @param abstainVotes - String representation of "abstain" votes
 * @returns Vote distribution with percentages and totals
 */
function safeParseFloat(value: string): number {
  const parsed = parseFloat(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function safeParseBigInt(value: string | undefined): bigint {
  if (!value) return BigInt(0);

  try {
    return BigInt(value);
  } catch {
    return BigInt(0);
  }
}

export function calculateVoteDistribution(
  forVotes: string,
  againstVotes: string,
  abstainVotes: string
): VoteDistribution {
  const forNum = safeParseFloat(forVotes);
  const againstNum = safeParseFloat(againstVotes);
  const abstainNum = safeParseFloat(abstainVotes);
  const total = forNum + againstNum + abstainNum;

  if (total === 0) {
    return {
      forPct: 0,
      againstPct: 0,
      abstainPct: 0,
      total: 0,
      hasVotes: false,
    };
  }

  return {
    forPct: (forNum / total) * 100,
    againstPct: (againstNum / total) * 100,
    abstainPct: (abstainNum / total) * 100,
    total,
    hasVotes: true,
  };
}

/**
 * Sum vote counts using bigint-safe arithmetic.
 * This is used for constitution quorum checks where For + Abstain count.
 */
export function sumVoteCounts(...values: Array<string | undefined>): string {
  return values
    .reduce((total, value) => total + safeParseBigInt(value), BigInt(0))
    .toString();
}

/**
 * Calculate quorum progress from bigint vote strings without losing precision.
 * Returns both the display percentage and a clamped percentage for bar widths.
 */
export function calculatePreciseQuorumProgress(
  current: string,
  required: string,
  reachedOverride?: boolean
): PreciseQuorumProgress {
  const currentBig = safeParseBigInt(current);
  const requiredBig = safeParseBigInt(required);

  if (requiredBig <= BigInt(0)) {
    return {
      percentage: 0,
      progressPercentage: 0,
      isReached: reachedOverride ?? false,
    };
  }

  const percentageTimesTen =
    (currentBig * BigInt(1000) + requiredBig / BigInt(2)) / requiredBig;
  const percentage = Number(percentageTimesTen) / 10;

  return {
    percentage,
    progressPercentage: Math.min(percentage, 100),
    isReached: reachedOverride ?? currentBig >= requiredBig,
  };
}

/**
 * Calculate quorum progress from current and required vote strings.
 * @param current - Current vote count as string
 * @param required - Required quorum as string
 * @param reachedOverride - Optional override for quorum reached status
 * @returns Quorum progress with percentage and reached status
 */
export function calculateQuorumProgress(
  current: string,
  required: string,
  reachedOverride?: boolean
): QuorumProgress {
  const currentNum = safeParseFloat(current);
  const requiredNum = safeParseFloat(required);
  const percentage =
    requiredNum > 0 ? Math.min(100, (currentNum / requiredNum) * 100) : 0;

  return {
    percentage,
    isReached: reachedOverride ?? percentage >= 100,
    current: currentNum,
    required: requiredNum,
  };
}
