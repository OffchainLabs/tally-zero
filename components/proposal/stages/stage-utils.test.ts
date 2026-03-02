/**
 * Tests for stage-utils component utilities
 */

import { describe, expect, it } from "vitest";

import { MS_PER_DAY } from "@/lib/date-utils";
import type { ProposalStage, StageType } from "@/types/proposal-stage";
import {
  calculateEstimatedCompletionTimes,
  getStageTxExplorerUrl,
  VOTING_EXTENSION_DAYS,
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
