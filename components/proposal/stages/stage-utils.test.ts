/**
 * Tests for stage-utils component utilities
 */

import { describe, expect, it } from "vitest";

import { L1_SECONDS_PER_BLOCK } from "@/config/arbitrum-governance";
import { formatDateRange, formatDateShort, MS_PER_DAY } from "@/lib/date-utils";
import type { ProposalStage, StageType } from "@/types/proposal-stage";
import {
  calculateEstimatedCompletionTimes,
  estimateVotingPeriodFromBlocks,
  formatVotingPeriod,
  getStageEstimatedDays,
  getStageExtraInfo,
  getStageTxExplorerUrl,
  isVotingExtensionStillPossible,
  resolveMinedBlockNumbers,
  VOTING_EXTENSION_DAYS,
  type VotingTimeRange,
} from "./stage-utils";

describe("getStageTxExplorerUrl", () => {
  const testHash =
    "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";

  it("returns Etherscan URL for ethereum chain", () => {
    const url = getStageTxExplorerUrl(testHash, "ethereum");
    expect(url).toBe(`https://etherscan.io/tx/${testHash}`);
  });

  it("returns Arbiscan URL for arb1 chain", () => {
    const url = getStageTxExplorerUrl(testHash, "arb1");
    expect(url).toBe(`https://arbiscan.io/tx/${testHash}`);
  });

  it("returns Nova Arbiscan URL for nova chain", () => {
    const url = getStageTxExplorerUrl(testHash, "nova");
    expect(url).toBe(`https://nova.arbiscan.io/tx/${testHash}`);
  });

  it("uses targetChain when provided", () => {
    const url = getStageTxExplorerUrl(testHash, "ethereum", "nova");
    expect(url).toBe(`https://nova.arbiscan.io/tx/${testHash}`);
  });
});

describe("VOTING_EXTENSION_DAYS constant", () => {
  it("is 2 days (Arbitrum voting extension period)", () => {
    expect(VOTING_EXTENSION_DAYS).toBe(2);
  });
});

describe("getStageEstimatedDays", () => {
  it("returns the 3-day L2 timelock for treasury proposals", () => {
    expect(getStageEstimatedDays("L2_TIMELOCK", 8, "treasury")).toBe(3);
  });

  it("keeps the 8-day L2 timelock for core proposals", () => {
    expect(getStageEstimatedDays("L2_TIMELOCK", 8, "core")).toBe(8);
  });

  it("does not alter non-timelock stages for treasury proposals", () => {
    expect(getStageEstimatedDays("VOTING_ACTIVE", 16, "treasury")).toBe(16);
    expect(getStageEstimatedDays("L1_TIMELOCK", 3, "treasury")).toBe(3);
  });
});

describe("formatVotingPeriod", () => {
  const votingStartDate = new Date("2026-07-01T12:00:00Z");
  const votingEndMinDate = new Date("2026-07-15T12:00:00Z");
  const boundaryBlocks = { startBlock: 1_000, endBlock: 2_000 };

  it("collapses to a single end date when no extension applies (min === max)", () => {
    const formatted = formatVotingPeriod({
      votingStartDate,
      votingEndMinDate,
      votingEndMaxDate: votingEndMinDate,
      ...boundaryBlocks,
    });

    expect(formatted).toBe(
      `${formatDateShort(votingStartDate)} → ${formatDateShort(votingEndMinDate)}`
    );
  });

  it("renders the end as a range while an extension is possible", () => {
    const votingEndMaxDate = new Date(
      votingEndMinDate.getTime() + VOTING_EXTENSION_DAYS * MS_PER_DAY
    );

    const formatted = formatVotingPeriod({
      votingStartDate,
      votingEndMinDate,
      votingEndMaxDate,
      ...boundaryBlocks,
    });

    expect(formatted).toBe(
      `${formatDateShort(votingStartDate)} → ${formatDateRange(
        votingEndMinDate,
        votingEndMaxDate
      )}`
    );
    // a 2-day extension window must not collapse to a single date
    expect(formatDateRange(votingEndMinDate, votingEndMaxDate)).not.toBe(
      formatDateShort(votingEndMinDate)
    );
  });
});

describe("isVotingExtensionStillPossible", () => {
  const makeRange = (endOffsetMs: number): VotingTimeRange => {
    const end = new Date(Date.now() + endOffsetMs);
    return {
      votingStartDate: new Date(end.getTime() - 14 * MS_PER_DAY),
      votingEndMinDate: end,
      votingEndMaxDate: new Date(
        end.getTime() + VOTING_EXTENSION_DAYS * MS_PER_DAY
      ),
      startBlock: 1_000,
      endBlock: 2_000,
    };
  };

  it("is true while voting is active and quorum has not been reached", () => {
    expect(isVotingExtensionStillPossible(makeRange(MS_PER_DAY), false)).toBe(
      true
    );
  });

  it("is false once quorum has been reached", () => {
    expect(isVotingExtensionStillPossible(makeRange(MS_PER_DAY), true)).toBe(
      false
    );
  });

  it("is false once the scheduled end has passed, even without quorum", () => {
    expect(isVotingExtensionStillPossible(makeRange(-MS_PER_DAY), false)).toBe(
      false
    );
  });
});

describe("estimateVotingPeriodFromBlocks", () => {
  const currentL1Block = 20_000_000;

  it("keeps the extension buffer while the vote window is open", () => {
    // #given — endBlock is ahead of the current L1 block
    const result = estimateVotingPeriodFromBlocks(
      "19999000",
      "20005000",
      currentL1Block
    );

    // #then
    expect(result).not.toBeNull();
    expect(result!.hasEnded).toBe(false);
    const { votingEndMinDate, votingEndMaxDate } = result!.range;
    expect(votingEndMaxDate.getTime() - votingEndMinDate.getTime()).toBe(
      VOTING_EXTENSION_DAYS * MS_PER_DAY
    );
  });

  it("spaces start and end by block distance at the L1 block time", () => {
    // #given — a 100-block vote window
    const result = estimateVotingPeriodFromBlocks(
      "20000100",
      "20000200",
      currentL1Block
    );

    // #then
    expect(
      result!.range.votingEndMinDate.getTime() -
        result!.range.votingStartDate.getTime()
    ).toBe(100 * L1_SECONDS_PER_BLOCK * 1000);
  });

  it("collapses the range once the vote window has passed", () => {
    // #given — endBlock is behind the current L1 block
    const result = estimateVotingPeriodFromBlocks(
      "19000000",
      "19500000",
      currentL1Block
    );

    // #then — no extension buffer, dates are in the past
    expect(result!.hasEnded).toBe(true);
    expect(result!.range.votingEndMinDate.getTime()).toBe(
      result!.range.votingEndMaxDate.getTime()
    );
    expect(result!.range.votingStartDate.getTime()).toBeLessThan(
      result!.range.votingEndMaxDate.getTime()
    );
  });

  it("collapses the end range once quorum is reached, even while voting is active", () => {
    const result = estimateVotingPeriodFromBlocks(
      "19999000",
      "20005000",
      currentL1Block,
      { quorumReached: true }
    )!;

    expect(result.hasEnded).toBe(false);
    // reached quorum rules out the late-quorum extension: fixed deadline
    expect(result.range.votingEndMinDate.getTime()).toBe(
      result.range.votingEndMaxDate.getTime()
    );
  });

  it("uses real block timestamps for mined boundary blocks when provided", () => {
    const startTs = 1_750_000_000;
    const endTs = 1_751_209_600;

    const result = estimateVotingPeriodFromBlocks(
      "19000000",
      "19500000",
      currentL1Block,
      {
        realTimestamps: new Map([
          [19_000_000, startTs],
          [19_500_000, endTs],
        ]),
      }
    )!;

    expect(result.hasEnded).toBe(true);
    expect(result.range.votingStartDate.getTime()).toBe(startTs * 1000);
    expect(result.range.votingEndMinDate.getTime()).toBe(endTs * 1000);
    expect(result.range.votingEndMaxDate.getTime()).toBe(endTs * 1000);
    // the range carries its boundary blocks for explorer verification links
    expect(result.range.startBlock).toBe(19_000_000);
    expect(result.range.endBlock).toBe(19_500_000);
  });

  it("keeps extrapolating boundaries missing from the timestamp map", () => {
    const startTs = 1_750_000_000;

    const result = estimateVotingPeriodFromBlocks(
      "19999000",
      "20005000",
      currentL1Block,
      { realTimestamps: new Map([[19_999_000, startTs]]) }
    )!;

    expect(result.range.votingStartDate.getTime()).toBe(startTs * 1000);
    // end block not mined yet, so it stays extrapolated with the buffer
    expect(
      result.range.votingEndMaxDate.getTime() -
        result.range.votingEndMinDate.getTime()
    ).toBe(VOTING_EXTENSION_DAYS * MS_PER_DAY);
  });

  it("returns null for missing or invalid inputs", () => {
    expect(
      estimateVotingPeriodFromBlocks(undefined, "100", currentL1Block)
    ).toBeNull();
    expect(
      estimateVotingPeriodFromBlocks("100", undefined, currentL1Block)
    ).toBeNull();
    expect(
      estimateVotingPeriodFromBlocks("", "100", currentL1Block)
    ).toBeNull();
    expect(
      estimateVotingPeriodFromBlocks("abc", "100", currentL1Block)
    ).toBeNull();
    expect(
      estimateVotingPeriodFromBlocks("0", "100", currentL1Block)
    ).toBeNull();
    expect(estimateVotingPeriodFromBlocks("100", "200", null)).toBeNull();
    expect(estimateVotingPeriodFromBlocks("100", "200", undefined)).toBeNull();
  });
});

describe("getStageExtraInfo", () => {
  const governor = "0xf07DeD9dC292157749B6Fd268E37DF6EA38395B9";

  it("links the votingDelay figure to the proposal's governor on Arbiscan", () => {
    const segments = getStageExtraInfo("PROPOSAL_CREATED", governor)!;
    const links = segments.filter((s) => typeof s !== "string");

    expect(links[0].href).toBe(
      `https://arbiscan.io/address/${governor}#readProxyContract#F31`
    );
    expect(links[0].label).toContain("21,600 L1 blocks");
    // the Constitution reference for the human-readable "3 days"
    expect(links[1].href).toContain(
      "docs.arbitrum.foundation/dao-constitution"
    );
    // the governance contracts source for the snapshot arithmetic
    expect(links[2].href).toBe(
      "https://github.com/ArbitrumFoundation/governance"
    );
  });

  it("returns null for stages without supplemental info", () => {
    expect(getStageExtraInfo("VOTING_ACTIVE", governor)).toBeNull();
    expect(getStageExtraInfo("L2_TIMELOCK", governor)).toBeNull();
  });
});

describe("resolveMinedBlockNumbers", () => {
  it("keeps only valid blocks at or below the current L1 block, deduplicated and sorted", () => {
    expect(
      resolveMinedBlockNumbers(
        ["200", 100, "100", "300", "abc", "", null, undefined, "0", "-5"],
        250
      )
    ).toEqual([100, 200]);
  });

  it("returns an empty list when the current L1 block is unknown", () => {
    expect(resolveMinedBlockNumbers(["100"], null)).toEqual([]);
    expect(resolveMinedBlockNumbers(["100"], undefined)).toEqual([]);
  });
});

describe("calculateEstimatedCompletionTimes", () => {
  const stageTypes = [
    { type: "PROPOSAL_CREATED" as StageType, estimatedDays: 0 },
    { type: "VOTING_ACTIVE" as StageType, estimatedDays: 16 },
    { type: "PROPOSAL_QUEUED" as StageType, estimatedDays: 0 },
    { type: "L2_TIMELOCK" as StageType, estimatedDays: 8 },
    { type: "L2_TO_L1_MESSAGE" as StageType, estimatedDays: 6.4 },
    { type: "L1_TIMELOCK" as StageType, estimatedDays: 3 },
    { type: "RETRYABLE_EXECUTED" as StageType, estimatedDays: 0 },
  ];

  it("produces different estimated times for stages with different durations", () => {
    // #given
    const stageMap = new Map<StageType, ProposalStage>();

    // #when
    const { estimatedTimes } = calculateEstimatedCompletionTimes(
      stageTypes,
      stageMap
    );

    // #then — stages with nonzero duration should have progressively later dates
    const votingTime = estimatedTimes.get("VOTING_ACTIVE")!;
    const l2TimelockTime = estimatedTimes.get("L2_TIMELOCK")!;
    const l2ToL1Time = estimatedTimes.get("L2_TO_L1_MESSAGE")!;
    const l1TimelockTime = estimatedTimes.get("L1_TIMELOCK")!;

    expect(votingTime.minDate.getTime()).toBeLessThan(
      l2TimelockTime.minDate.getTime()
    );
    expect(l2TimelockTime.minDate.getTime()).toBeLessThan(
      l2ToL1Time.minDate.getTime()
    );
    expect(l2ToL1Time.minDate.getTime()).toBeLessThan(
      l1TimelockTime.minDate.getTime()
    );
  });

  it("adds correct cumulative duration in days", () => {
    // #given
    const stageMap = new Map<StageType, ProposalStage>();

    // #when
    const { estimatedTimes } = calculateEstimatedCompletionTimes(
      stageTypes,
      stageMap
    );

    // #then — voting ends at +16 days, L2 timelock at +24 days
    const votingMin = estimatedTimes.get("VOTING_ACTIVE")!.minDate.getTime();
    const l2TimelockMin = estimatedTimes.get("L2_TIMELOCK")!.minDate.getTime();

    const daysBetween = (l2TimelockMin - votingMin) / MS_PER_DAY;
    expect(daysBetween).toBe(8);
  });

  it("adds voting extension buffer to maxDate", () => {
    // #given — no block data, no voting stage data → extensionPossible defaults true
    const stageMap = new Map<StageType, ProposalStage>();

    // #when
    const { estimatedTimes } = calculateEstimatedCompletionTimes(
      stageTypes,
      stageMap
    );

    // #then — voting maxDate should be 2 days after minDate (extension buffer)
    const votingTime = estimatedTimes.get("VOTING_ACTIVE")!;
    const extensionMs = VOTING_EXTENSION_DAYS * MS_PER_DAY;
    expect(votingTime.maxDate.getTime() - votingTime.minDate.getTime()).toBe(
      extensionMs
    );
  });

  it("skips completed stages in cumulative calculation", () => {
    // #given
    const now = Math.floor(Date.now() / 1000);
    const stageMap = new Map<StageType, ProposalStage>();
    stageMap.set("PROPOSAL_CREATED", {
      type: "PROPOSAL_CREATED",
      status: "COMPLETED",
      chain: "arb1",
      chainId: 42161,
      transactions: [
        {
          hash: "0x1",
          blockNumber: 1,
          timestamp: now - 86400,
          chain: "arb1",
          chainId: 42161,
        },
      ],
      data: {} as ProposalStage["data"],
    } as ProposalStage);
    stageMap.set("VOTING_ACTIVE", {
      type: "VOTING_ACTIVE",
      status: "COMPLETED",
      chain: "arb1",
      chainId: 42161,
      transactions: [
        {
          hash: "0x2",
          blockNumber: 2,
          timestamp: now,
          chain: "arb1",
          chainId: 42161,
        },
      ],
      data: {} as ProposalStage["data"],
    } as ProposalStage);

    // #when
    const { estimatedTimes } = calculateEstimatedCompletionTimes(
      stageTypes,
      stageMap
    );

    // #then — completed stages should not have estimated times
    expect(estimatedTimes.has("PROPOSAL_CREATED")).toBe(false);
    expect(estimatedTimes.has("VOTING_ACTIVE")).toBe(false);

    // pending stages should still have estimates
    expect(estimatedTimes.has("L2_TIMELOCK")).toBe(true);
  });

  it("uses real timestamps for the voting time range when provided", () => {
    // #given — voting window fully in the past, with real block timestamps
    const startTs = 1_700_000_000;
    const endTs = 1_701_209_600;
    const stageMap = new Map<StageType, ProposalStage>();
    stageMap.set("PROPOSAL_CREATED", {
      type: "PROPOSAL_CREATED",
      status: "COMPLETED",
      chain: "arb1",
      chainId: 42161,
      transactions: [
        {
          hash: "0x1",
          blockNumber: 1,
          timestamp: startTs,
          chain: "arb1",
          chainId: 42161,
        },
      ],
      data: { startBlock: "1000", endBlock: "2000" } as ProposalStage["data"],
    } as ProposalStage);

    // #when
    const { votingTimeRange } = calculateEstimatedCompletionTimes(
      stageTypes,
      stageMap,
      3000,
      new Map([
        [1000, startTs],
        [2000, endTs],
      ])
    );

    // #then — exact on-chain timestamps, not extrapolation
    expect(votingTimeRange!.votingStartDate.getTime()).toBe(startTs * 1000);
    expect(votingTimeRange!.votingEndMinDate.getTime()).toBe(endTs * 1000);
  });

  it("uses last completed stage timestamp as reference point", () => {
    // #given
    const referenceTimestamp = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
    const stageMap = new Map<StageType, ProposalStage>();
    stageMap.set("PROPOSAL_CREATED", {
      type: "PROPOSAL_CREATED",
      status: "COMPLETED",
      chain: "arb1",
      chainId: 42161,
      transactions: [
        {
          hash: "0x1",
          blockNumber: 1,
          timestamp: referenceTimestamp,
          chain: "arb1",
          chainId: 42161,
        },
      ],
      data: {} as ProposalStage["data"],
    } as ProposalStage);

    // #when
    const { estimatedTimes } = calculateEstimatedCompletionTimes(
      stageTypes,
      stageMap
    );

    // #then — voting estimate should be based on the reference timestamp + 16 days
    const votingTime = estimatedTimes.get("VOTING_ACTIVE")!;
    const expectedMinMs = referenceTimestamp * 1000 + 16 * MS_PER_DAY;
    expect(votingTime.minDate.getTime()).toBe(expectedMinMs);
  });
});
