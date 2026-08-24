import { describe, expect, it } from "vitest";

import { GOVERNORS } from "@/config/governors";
import type { ProposalStage, StageStatus } from "@/types/proposal-stage";
import { areAllStagesComplete, getLifecyclePhase } from "@gzeoneth/gov-tracker";

import {
  describeRoundTripPhase,
  roundTripFromStages,
} from "./proposal-round-trip";

const CORE = GOVERNORS.core.address;
const TREASURY = GOVERNORS.treasury.address;

function stage(type: string, status: StageStatus): ProposalStage {
  return { type, status, transactions: [] } as unknown as ProposalStage;
}

const THROUGH_L2 = [
  stage("PROPOSAL_CREATED", "COMPLETED"),
  stage("VOTING_ACTIVE", "COMPLETED"),
  stage("PROPOSAL_QUEUED", "COMPLETED"),
  stage("L2_TIMELOCK", "COMPLETED"),
];

const BRIDGING = [...THROUGH_L2, stage("L2_TO_L1_MESSAGE", "PENDING")];

const FINISHED = [
  ...THROUGH_L2,
  stage("L2_TO_L1_MESSAGE", "COMPLETED"),
  stage("L1_TIMELOCK", "COMPLETED"),
  stage("RETRYABLE_EXECUTED", "COMPLETED"),
];

describe("roundTripFromStages", () => {
  it("is pending while the L2→L1 message is in flight", () => {
    expect(roundTripFromStages(BRIDGING, CORE)).toEqual({
      status: "pending",
      phase: "bridging",
    });
  });

  it("is complete once the retryable is redeemed", () => {
    expect(roundTripFromStages(FINISHED, CORE)).toEqual({
      status: "complete",
      phase: "executed",
    });
  });

  it("names the later hops", () => {
    const l1 = [
      ...THROUGH_L2,
      stage("L2_TO_L1_MESSAGE", "COMPLETED"),
      stage("L1_TIMELOCK", "PENDING"),
    ];
    expect(roundTripFromStages(l1, CORE)?.phase).toBe("l1_delay");

    const redeem = FINISHED.map((s) =>
      s.type === "RETRYABLE_EXECUTED"
        ? stage("RETRYABLE_EXECUTED", "PENDING")
        : s
    );
    expect(roundTripFromStages(redeem, CORE)?.phase).toBe("finalizing");
  });

  // The regression that matters: gov-tracker's own helpers call this finished,
  // because a checkpoint saved on a stage boundary holds only COMPLETED stages.
  it("does not call a boundary-saved checkpoint complete", () => {
    expect(areAllStagesComplete(THROUGH_L2)).toBe(true);
    expect(getLifecyclePhase(THROUGH_L2)).toBe("executed");

    expect(roundTripFromStages(THROUGH_L2, CORE)).toEqual({
      status: "pending",
      phase: "unknown",
    });
  });

  it("treats a Treasury proposal as done at its L2 timelock", () => {
    // Treasury's finalStage is L2_TIMELOCK, so the same stages that leave a
    // Core proposal pending finish a Treasury one.
    expect(roundTripFromStages(THROUGH_L2, TREASURY)?.status).toBe("complete");
  });

  it("counts a skipped final stage as settled", () => {
    const skipped = FINISHED.map((s) =>
      s.type === "RETRYABLE_EXECUTED"
        ? stage("RETRYABLE_EXECUTED", "SKIPPED")
        : s
    );
    expect(roundTripFromStages(skipped, CORE)?.status).toBe("complete");
  });

  it("returns null without evidence, rather than guessing", () => {
    expect(roundTripFromStages([], CORE)).toBeNull();
    expect(roundTripFromStages(THROUGH_L2.slice(0, 3), CORE)).toBeNull();
    expect(
      roundTripFromStages(
        FINISHED,
        "0x0000000000000000000000000000000000000000"
      )
    ).toBeNull();
  });
});

describe("describeRoundTripPhase", () => {
  it("names the pending hop and says nothing otherwise", () => {
    expect(
      describeRoundTripPhase({ status: "pending", phase: "bridging" })
    ).toMatch(/challenge period/);
    expect(
      describeRoundTripPhase({ status: "pending", phase: "unknown" })
    ).toBe("L1 round-trip in progress");
    expect(
      describeRoundTripPhase({ status: "complete", phase: "executed" })
    ).toBeNull();
    expect(describeRoundTripPhase(null)).toBeNull();
  });
});
