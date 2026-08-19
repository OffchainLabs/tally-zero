import {
  L1_SECONDS_PER_BLOCK,
  L2_TIMELOCK_DAYS,
} from "@/config/arbitrum-governance";
import type { GovernorType } from "@/config/governors";
import type { StageMetadataWithType } from "@/hooks/use-proposal-stages";
import {
  createGoogleCalendarUrl,
  formatDateRange,
  formatDateShort,
  MS_PER_DAY,
  type EstimatedTimeRange,
} from "@/lib/date-utils";
import {
  getAddressExplorerUrl,
  getTxExplorerUrl,
  type ChainId,
} from "@/lib/explorer-utils";
import {
  getStageData,
  type ProposalStage,
  type StageType,
} from "@/types/proposal-stage";
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

export const VOTING_EXTENSION_DAYS = 2;

export interface StageExtraInfoLink {
  label: string;
  href: string;
  /** Hover text explaining what the link lets the user verify */
  title?: string;
}

export type StageExtraInfoSegment = string | StageExtraInfoLink;

/**
 * User-facing context for stages whose gov-tracker description alone does
 * not explain the governance timing, as text segments interleaved with
 * reference links so every stated figure is verifiable.
 *
 * For PROPOSAL_CREATED: the Constitution specifies the delay as "3 days" in
 * human terms; the contracts encode it as `votingDelay()` = 21,600 L1
 * blocks (Arbitrum governors count time in L1 block numbers, and 21,600 x
 * 12s = 3 days), identical on the Core and Treasury governors. The figure
 * links to the proposal's own governor on Arbiscan so users can call
 * `votingDelay()` themselves.
 */
export function getStageExtraInfo(
  stageType: StageType,
  governorAddress: string
): StageExtraInfoSegment[] | null {
  if (stageType === "PROPOSAL_CREATED") {
    return [
      "Voting begins 3 days after on-chain submission: the governor's ",
      {
        label: "votingDelay of 21,600 L1 blocks",
        // #F31 jumps straight to votingDelay() on Arbiscan's Read as Proxy
        // tab (same function index on both governors, they share the ABI)
        href: `${getAddressExplorerUrl(governorAddress, "arb1")}#readProxyContract#F31`,
        title:
          "Verify on Arbiscan: call votingDelay() under Read as Proxy. Arbitrum governors count time in L1 block numbers; 21,600 blocks x 12s = 3 days.",
      },
      ". The voting-power snapshot is taken when the delay ends, so delegation changes still count until then. ",
      {
        label: "Arbitrum Constitution, Phase 2",
        href: "https://docs.arbitrum.foundation/dao-constitution#phase-2-formal-aip-and-call-for-voting-3-days",
        title:
          "The Constitution specifies the 3-day delay; the contract encodes it in L1 blocks.",
      },
      " · ",
      {
        label: "Governor source code",
        href: "https://github.com/ArbitrumFoundation/governance",
        title:
          "L2ArbitrumGovernor (OpenZeppelin Governor) sets the snapshot to block.number + votingDelay when propose() executes; on Arbitrum, block.number is the sequencer's view of the L1 block number.",
      },
    ];
  }
  return null;
}

/**
 * Resolve the estimated duration (in days) for a stage, accounting for the
 * proposal type.
 *
 * gov-tracker's stage metadata always reports the 8-day Constitutional L2
 * timelock, but Treasury (non-Constitutional) proposals only have a 3-day L2
 * waiting period (Arbitrum Constitution, Section 2, Phase 4). All other stages
 * keep the value reported by gov-tracker.
 */
export function getStageEstimatedDays(
  stageType: StageType,
  baseEstimatedDays: number | undefined,
  governorType: GovernorType
): number | undefined {
  if (stageType === "L2_TIMELOCK" && governorType === "treasury") {
    return L2_TIMELOCK_DAYS.treasury;
  }
  return baseEstimatedDays;
}

/** Stages that only exist for Security Council election proposals. */
const ELECTION_STAGE_TYPES: StageType[] = [
  "CREATE_ELECTION",
  "NOMINEE_ELECTION",
  "NOMINEE_VETTING",
  "MEMBER_ELECTION",
];

export interface SelectRelevantStageTypesInput {
  /** The full, ordered stage list from gov-tracker. */
  allStageTypes: StageMetadataWithType[];
  isElection: boolean;
  isDefeated: boolean;
  isTreasury: boolean;
  governorType: GovernorType;
}

/**
 * Narrow gov-tracker's full stage list to the stages a given proposal will
 * actually go through, and apply the Treasury timelock override.
 *
 * Three independent filters, in precedence order:
 *  - non-election proposals drop the four election-only stages;
 *  - a defeated proposal stops at VOTING_ACTIVE — it will never execute;
 *  - a Treasury proposal stops at L2_TIMELOCK — it has no L1 round-trip.
 *
 * Defeated is checked before Treasury, so a defeated Treasury proposal stops at
 * voting rather than at the timelock.
 */
export function selectRelevantStageTypes({
  allStageTypes,
  isElection,
  isDefeated,
  isTreasury,
  governorType,
}: SelectRelevantStageTypesInput): StageMetadataWithType[] {
  // Index map for O(1) lookups instead of repeated findIndex calls.
  const stageTypeToIndex = new Map(
    allStageTypes.map((s, idx) => [s.type, idx])
  );
  const votingIdx = stageTypeToIndex.get("VOTING_ACTIVE") ?? -1;
  const l2ExecutedIdx = stageTypeToIndex.get("L2_TIMELOCK") ?? -1;

  return allStageTypes
    .filter((meta) => {
      if (!isElection && ELECTION_STAGE_TYPES.includes(meta.type)) {
        return false;
      }

      const currentIdx = stageTypeToIndex.get(meta.type) ?? -1;

      if (isDefeated) {
        return currentIdx <= votingIdx;
      }
      if (isTreasury) {
        return currentIdx <= l2ExecutedIdx;
      }
      return true;
    })
    .map((meta) => ({
      ...meta,
      estimatedDays:
        getStageEstimatedDays(meta.type, meta.estimatedDays, governorType) ??
        meta.estimatedDays,
    }));
}

export interface BlockBasedTiming {
  startBlock: number;
  endBlock: number;
  currentL1Block: number;
}

export interface VotingTimeRange {
  votingStartDate: Date;
  votingEndMinDate: Date;
  votingEndMaxDate: Date;
  /**
   * L1 block at which voting starts, as reported on-chain by
   * `proposalSnapshot` / the ProposalCreated event. Users can verify the
   * displayed dates against this block on Etherscan.
   */
  startBlock: number;
  /**
   * L1 block at which voting ends (`proposalDeadline`): the scheduled end
   * block, or the extended deadline when a late-quorum extension happened.
   */
  endBlock: number;
}

export interface EstimatedTimesResult {
  estimatedTimes: Map<StageType, EstimatedTimeRange>;
  votingTimeRange: VotingTimeRange | null;
}

interface StageMetaWithDuration {
  type: StageType;
  estimatedDays?: number;
}

interface ReferencePoint {
  time: Date;
  startFromIndex: number;
}

/**
 * Find the last completed stage to use as reference point for time calculations
 */
function findReferencePoint(
  allStageTypes: StageMetaWithDuration[],
  stageMap: Map<StageType, ProposalStage>
): ReferencePoint {
  for (let i = allStageTypes.length - 1; i >= 0; i--) {
    const stage = stageMap.get(allStageTypes[i].type);
    if (stage?.status === "COMPLETED" && stage.transactions?.[0]?.timestamp) {
      return {
        time: new Date(stage.transactions[0].timestamp * 1000),
        startFromIndex: i + 1,
      };
    }
  }
  return { time: new Date(), startFromIndex: 0 };
}

interface VotingTimingParams {
  startBlock: number;
  endBlock: number;
  currentL1Block: number;
  extensionPossible: boolean;
  extendedDeadline: number | null;
  wasExtended: boolean;
  /** Real timestamps (unix seconds) of already-mined boundary blocks */
  realTimestamps?: ReadonlyMap<number, number>;
}

/**
 * Calculate voting time range from L1 block data.
 *
 * Boundary blocks present in `realTimestamps` use their exact on-chain
 * timestamp; the rest are extrapolated from the current L1 block at the
 * 12s L1 block time (the only option for blocks not mined yet).
 */
function calculateVotingTimeRange(
  params: VotingTimingParams
): { timing: BlockBasedTiming; range: VotingTimeRange } | null {
  const {
    startBlock,
    endBlock,
    currentL1Block,
    extensionPossible,
    extendedDeadline,
    wasExtended,
    realTimestamps,
  } = params;

  if (isNaN(startBlock) || isNaN(endBlock)) return null;

  const now = Date.now();
  const blocksUntilStart = startBlock - currentL1Block;

  const actualEndBlock =
    wasExtended && extendedDeadline && !isNaN(extendedDeadline)
      ? extendedDeadline
      : endBlock;
  const blocksUntilEnd = actualEndBlock - currentL1Block;

  const startTimestamp = realTimestamps?.get(startBlock);
  const endTimestamp = realTimestamps?.get(actualEndBlock);

  const votingStartMs =
    startTimestamp !== undefined
      ? startTimestamp * 1000
      : now + blocksUntilStart * L1_SECONDS_PER_BLOCK * 1000;
  const votingEndMinMs =
    endTimestamp !== undefined
      ? endTimestamp * 1000
      : now + blocksUntilEnd * L1_SECONDS_PER_BLOCK * 1000;
  const votingEndMaxMs = extensionPossible
    ? votingEndMinMs + VOTING_EXTENSION_DAYS * MS_PER_DAY
    : votingEndMinMs;

  return {
    timing: { startBlock, endBlock, currentL1Block },
    range: {
      votingStartDate: new Date(votingStartMs),
      votingEndMinDate: new Date(votingEndMinMs),
      votingEndMaxDate: new Date(votingEndMaxMs),
      startBlock,
      endBlock: actualEndBlock,
    },
  };
}

/**
 * Format the two halves of a voting time range separately, so UIs can link
 * each half to its boundary block on a block explorer.
 *
 * Every producer of a VotingTimeRange sets votingEndMaxDate equal to
 * votingEndMinDate when no extension applies, and formatDateRange collapses
 * equal dates to a single one, so this single formatter covers both the
 * "fixed end" and "end range" cases for all voting-period UIs.
 */
export function formatVotingPeriodParts(range: VotingTimeRange): {
  start: string;
  end: string;
  /** Whether the start boundary block is already mined (date in the past) */
  startIsMined: boolean;
  /** Whether the end boundary block is already mined (date in the past) */
  endIsMined: boolean;
} {
  const now = Date.now();
  return {
    start: formatDateShort(range.votingStartDate),
    end: formatDateRange(range.votingEndMinDate, range.votingEndMaxDate),
    startIsMined: range.votingStartDate.getTime() <= now,
    endIsMined: range.votingEndMinDate.getTime() <= now,
  };
}

/**
 * Format a voting time range for display: "start → end".
 */
export function formatVotingPeriod(range: VotingTimeRange): string {
  const { start, end } = formatVotingPeriodParts(range);
  return `${start} → ${end}`;
}

/**
 * Whether the +2 day late-quorum extension can still occur: only while the
 * scheduled vote end is in the future and quorum has not been reached.
 * GovernorPreventLateQuorum extends the deadline when quorum arrives late,
 * so once quorum is reached the extension either already happened or never
 * will, and past the scheduled end a quorum-less vote is simply defeated.
 * Single source of truth for showing the "+2d extension possible" badge.
 */
export function isVotingExtensionStillPossible(
  range: VotingTimeRange,
  quorumReached: boolean
): boolean {
  return !quorumReached && range.votingEndMinDate.getTime() > Date.now();
}

export interface EstimatedVotingPeriod {
  range: VotingTimeRange;
  /** True once the scheduled vote window is behind the current L1 block */
  hasEnded: boolean;
}

/**
 * Estimate the voting period directly from a proposal's L1 vote window,
 * without gov-tracker stage data (used by the vote summary card so it does
 * not have to occupy a stage-tracking queue slot).
 *
 * While the window is open the end range assumes the +2 day quorum
 * extension is still possible, matching the stages UI default. Once
 * endBlock has passed the range collapses to the scheduled end; an actual
 * extension cannot be detected without stage data.
 */
export interface EstimateVotingPeriodOptions {
  /** Real timestamps (unix seconds) of already-mined boundary blocks */
  realTimestamps?: ReadonlyMap<number, number>;
  /**
   * Whether quorum is already reached. A reached quorum rules out the
   * late-quorum extension (same rule gov-tracker applies from on-chain
   * state), so the end range collapses to the fixed deadline.
   */
  quorumReached?: boolean;
}

export function estimateVotingPeriodFromBlocks(
  startBlock: string | undefined,
  endBlock: string | undefined,
  currentL1Block: number | null | undefined,
  options?: EstimateVotingPeriodOptions
): EstimatedVotingPeriod | null {
  if (!startBlock || !endBlock || !currentL1Block) return null;

  const start = Number(startBlock);
  const end = Number(endBlock);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start <= 0) {
    return null;
  }

  const hasEnded = end < currentL1Block;
  const result = calculateVotingTimeRange({
    startBlock: start,
    endBlock: end,
    currentL1Block,
    extensionPossible: !hasEnded && !options?.quorumReached,
    extendedDeadline: null,
    wasExtended: false,
    realTimestamps: options?.realTimestamps,
  });

  return result ? { range: result.range, hasEnded } : null;
}

/**
 * Parse candidate block numbers and keep only those already mined on L1,
 * i.e. blocks whose real timestamps can be fetched. Returns a deduplicated
 * sorted list; empty until the current L1 block is known.
 */
export function resolveMinedBlockNumbers(
  candidates: Array<string | number | null | undefined>,
  currentL1Block: number | null | undefined
): number[] {
  if (!currentL1Block) return [];

  const mined = new Set<number>();
  for (const candidate of candidates) {
    if (candidate === null || candidate === undefined || candidate === "") {
      continue;
    }
    const block = Number(candidate);
    if (Number.isFinite(block) && block > 0 && block <= currentL1Block) {
      mined.add(block);
    }
  }
  return [...mined].sort((a, b) => a - b);
}

/**
 * Calculate estimated completion times for all stages
 */
export function calculateEstimatedCompletionTimes(
  allStageTypes: StageMetaWithDuration[],
  stageMap: Map<StageType, ProposalStage>,
  currentL1Block?: number,
  realTimestamps?: ReadonlyMap<number, number>
): EstimatedTimesResult {
  const estimatedTimes = new Map<StageType, EstimatedTimeRange>();

  const { time: referenceTime, startFromIndex } = findReferencePoint(
    allStageTypes,
    stageMap
  );

  // Extract stage data using type guards
  const proposalCreatedStage = stageMap.get("PROPOSAL_CREATED");
  const votingStage = stageMap.get("VOTING_ACTIVE");
  const proposalData = proposalCreatedStage
    ? getStageData(proposalCreatedStage, "PROPOSAL_CREATED")
    : null;
  const votingData = votingStage
    ? getStageData(votingStage, "VOTING_ACTIVE")
    : null;

  const extensionPossible = votingData?.extensionPossible !== false;
  const wasExtended = Boolean(votingData?.wasExtended);
  const extendedDeadline = votingData?.extendedDeadline
    ? Number(votingData.extendedDeadline)
    : null;

  // Calculate block-based voting timing if we have block data
  let votingResult: {
    timing: BlockBasedTiming;
    range: VotingTimeRange;
  } | null = null;
  if (currentL1Block && proposalData?.startBlock && proposalData?.endBlock) {
    votingResult = calculateVotingTimeRange({
      startBlock: Number(proposalData.startBlock),
      endBlock: Number(proposalData.endBlock),
      currentL1Block,
      extensionPossible,
      extendedDeadline,
      wasExtended,
      realTimestamps,
    });
  }

  // Calculate cumulative time ranges for each pending stage
  let cumulativeMinMs = referenceTime.getTime();
  let cumulativeMaxMs = referenceTime.getTime();

  for (let i = startFromIndex; i < allStageTypes.length; i++) {
    const meta = allStageTypes[i];
    const stage = stageMap.get(meta.type);

    if (stage?.status === "COMPLETED") continue;

    if (meta.type === "VOTING_ACTIVE" && votingResult) {
      cumulativeMinMs = votingResult.range.votingEndMinDate.getTime();
      cumulativeMaxMs = votingResult.range.votingEndMaxDate.getTime();
      estimatedTimes.set(meta.type, {
        minDate: votingResult.range.votingEndMinDate,
        maxDate: votingResult.range.votingEndMaxDate,
      });
    } else {
      const durationDays = meta.estimatedDays ?? 0;
      cumulativeMinMs += durationDays * MS_PER_DAY;
      cumulativeMaxMs += durationDays * MS_PER_DAY;

      if (meta.type === "VOTING_ACTIVE" && extensionPossible) {
        cumulativeMaxMs += VOTING_EXTENSION_DAYS * MS_PER_DAY;
      }

      estimatedTimes.set(meta.type, {
        minDate: new Date(cumulativeMinMs),
        maxDate: new Date(cumulativeMaxMs),
      });
    }
  }

  return { estimatedTimes, votingTimeRange: votingResult?.range ?? null };
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
    `ArbitrumDAO: ${stageTitle}`,
    estimatedTime.minDate,
    details
  );
}
