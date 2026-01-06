/**
 * Utility functions for vote and quorum calculations.
 * Centralizes the logic used across VoteDistributionBar, QuorumIndicator, etc.
 */

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

/**
 * Calculate vote distribution percentages from vote strings.
 * @param forVotes - String representation of "for" votes
 * @param againstVotes - String representation of "against" votes
 * @param abstainVotes - String representation of "abstain" votes
 * @returns Vote distribution with percentages and totals
 */
export function calculateVoteDistribution(
  forVotes: string,
  againstVotes: string,
  abstainVotes: string
): VoteDistribution {
  const forNum = parseFloat(forVotes) || 0;
  const againstNum = parseFloat(againstVotes) || 0;
  const abstainNum = parseFloat(abstainVotes) || 0;
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
  const currentNum = parseFloat(current) || 0;
  const requiredNum = parseFloat(required) || 0;
  const percentage =
    requiredNum > 0 ? Math.min(100, (currentNum / requiredNum) * 100) : 0;

  return {
    percentage,
    isReached: reachedOverride ?? percentage >= 100,
    current: currentNum,
    required: requiredNum,
  };
}
