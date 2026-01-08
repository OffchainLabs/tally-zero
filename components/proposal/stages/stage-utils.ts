import { L1_SECONDS_PER_BLOCK } from "@/config/arbitrum-governance";
import {
  createGoogleCalendarUrl,
  MS_PER_DAY,
  type EstimatedTimeRange,
} from "@/lib/date-utils";
import { getTxExplorerUrl, type ChainId } from "@/lib/explorer-utils";
import type { ProposalStage, StageType } from "@/types/proposal-stage";
import type { Chain } from "@gzeoneth/gov-tracker";

/**
 * Get the explorer URL for a transaction based on chain
 * Supports gov-tracker's Chain type ("ethereum", "arb1", "nova")
 */
export function getStageTxExplorerUrl(
  hash: string,
  chain: Chain,
  targetChain?: Chain
): string {
  // For cross-chain transactions (retryables), use targetChain if provided
  const effectiveChain = targetChain || chain;
  return getTxExplorerUrl(hash, effectiveChain as ChainId);
}

/**
 * Parse estimated duration string to min/max days
 */
export function parseEstimatedDurationRange(duration?: string): {
  min: number;
  max: number;
} {
  if (!duration) return { min: 0, max: 0 };

  // Remove ~ prefix if present
  const cleaned = duration.replace(/^~/, "").trim();

  // Check for range (e.g., "14-16 days")
  const rangeMatch = cleaned.match(/(\d+)-(\d+)\s*days?/i);
  if (rangeMatch) {
    return {
      min: parseInt(rangeMatch[1], 10),
      max: parseInt(rangeMatch[2], 10),
    };
  }

  // Check for single value (e.g., "3 days")
  const singleMatch = cleaned.match(/(\d+)\s*days?/i);
  if (singleMatch) {
    const days = parseInt(singleMatch[1], 10);
    return { min: days, max: days };
  }

  return { min: 0, max: 0 };
}

export const VOTING_EXTENSION_DAYS = 2;

export interface BlockBasedTiming {
  startBlock: number;
  endBlock: number;
  currentL1Block: number;
}

export interface VotingTimeRange {
  votingStartDate: Date;
  votingEndMinDate: Date;
  votingEndMaxDate: Date;
}

export interface EstimatedTimesResult {
  estimatedTimes: Map<StageType, EstimatedTimeRange>;
  votingTimeRange: VotingTimeRange | null;
}

/**
 * Calculate estimated completion times for all stages
 */
export function calculateEstimatedCompletionTimes(
  allStageTypes: Array<{ type: StageType; estimatedDuration?: string }>,
  stages: ProposalStage[],
  stageMap: Map<StageType, ProposalStage>,
  currentL1Block?: number
): EstimatedTimesResult {
  const estimatedTimes = new Map<StageType, EstimatedTimeRange>();
  let votingTimeRange: VotingTimeRange | null = null;

  // Find the last completed stage to use as a reference point
  let referenceTime: Date | null = null;
  let startFromIndex = 0;

  for (let i = allStageTypes.length - 1; i >= 0; i--) {
    const stageType = allStageTypes[i].type;
    const stage = stageMap.get(stageType);

    if (stage?.status === "COMPLETED" && stage.transactions?.[0]?.timestamp) {
      referenceTime = new Date(stage.transactions[0].timestamp * 1000);
      startFromIndex = i + 1;
      break;
    }
  }

  // If no completed stage found, use current time
  if (!referenceTime) {
    referenceTime = new Date();
  }

  // Extract block data from PROPOSAL_CREATED stage if available
  const proposalCreatedStage = stageMap.get("PROPOSAL_CREATED");
  const votingStage = stageMap.get("VOTING_ACTIVE");
  let blockBasedTiming: BlockBasedTiming | null = null;

  // Check if extension is still possible and if it was extended
  const extensionPossible = votingStage?.data?.extensionPossible !== false;
  const wasExtended = Boolean(votingStage?.data?.wasExtended);
  const extendedDeadline = votingStage?.data?.extendedDeadline
    ? Number(votingStage.data.extendedDeadline)
    : null;

  if (
    currentL1Block &&
    proposalCreatedStage?.data &&
    "startBlock" in proposalCreatedStage.data &&
    "endBlock" in proposalCreatedStage.data
  ) {
    const startBlock = Number(proposalCreatedStage.data.startBlock);
    const endBlock = Number(proposalCreatedStage.data.endBlock);

    if (!isNaN(startBlock) && !isNaN(endBlock)) {
      blockBasedTiming = {
        startBlock,
        endBlock,
        currentL1Block,
      };

      // Calculate voting start and end times
      const now = Date.now();
      const blocksUntilStart = startBlock - currentL1Block;

      // If proposal was extended, use the extended deadline
      const actualEndBlock =
        wasExtended && extendedDeadline && !isNaN(extendedDeadline)
          ? extendedDeadline
          : endBlock;
      const blocksUntilEnd = actualEndBlock - currentL1Block;

      const votingStartMs =
        now + blocksUntilStart * L1_SECONDS_PER_BLOCK * 1000;
      const votingEndMinMs = now + blocksUntilEnd * L1_SECONDS_PER_BLOCK * 1000;
      // Only add extension time if extension is still possible (not extended and quorum not reached)
      const votingEndMaxMs = extensionPossible
        ? votingEndMinMs + VOTING_EXTENSION_DAYS * MS_PER_DAY
        : votingEndMinMs;

      votingTimeRange = {
        votingStartDate: new Date(votingStartMs),
        votingEndMinDate: new Date(votingEndMinMs),
        votingEndMaxDate: new Date(votingEndMaxMs),
      };
    }
  }

  // Calculate cumulative time ranges for each pending stage
  let cumulativeMinMs = referenceTime.getTime();
  let cumulativeMaxMs = referenceTime.getTime();

  for (let i = startFromIndex; i < allStageTypes.length; i++) {
    const meta = allStageTypes[i];
    const stage = stageMap.get(meta.type);

    // Skip completed stages
    if (stage?.status === "COMPLETED") continue;

    // Use block-based timing for VOTING_ACTIVE if available
    if (meta.type === "VOTING_ACTIVE" && blockBasedTiming && votingTimeRange) {
      // Set cumulative to voting end time
      cumulativeMinMs = votingTimeRange.votingEndMinDate.getTime();
      cumulativeMaxMs = votingTimeRange.votingEndMaxDate.getTime();

      estimatedTimes.set(meta.type, {
        minDate: votingTimeRange.votingEndMinDate,
        maxDate: votingTimeRange.votingEndMaxDate,
      });
    } else {
      // Fallback to duration-based calculation
      const durationRange = parseEstimatedDurationRange(meta.estimatedDuration);
      cumulativeMinMs += durationRange.min * MS_PER_DAY;
      cumulativeMaxMs += durationRange.max * MS_PER_DAY;

      // Voting can have a 2-day extension, which affects all subsequent stages
      // Only add if extension is still possible
      if (meta.type === "VOTING_ACTIVE" && extensionPossible) {
        cumulativeMaxMs += VOTING_EXTENSION_DAYS * MS_PER_DAY;
      }

      estimatedTimes.set(meta.type, {
        minDate: new Date(cumulativeMinMs),
        maxDate: new Date(cumulativeMaxMs),
      });
    }
  }

  return { estimatedTimes, votingTimeRange };
}

/**
 * Create Google Calendar URL for a proposal stage
 */
export function createStageCalendarUrl(
  stageTitle: string,
  estimatedTime: EstimatedTimeRange,
  proposalId: string
): string {
  const details = `Estimated completion for proposal stage.\n\nProposal ID: ${proposalId}\nStage: ${stageTitle}\n\nView proposal at TallyZero`;
  return createGoogleCalendarUrl(
    `Arbitrum DAO: ${stageTitle}`,
    estimatedTime.minDate,
    details
  );
}
