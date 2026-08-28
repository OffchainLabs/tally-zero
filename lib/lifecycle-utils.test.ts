import { areAllStagesComplete, getLifecyclePhase } from "@gzeoneth/gov-tracker";
import { describe, expect, it } from "vitest";

import { GOVERNORS } from "@/config/governors";
import type { ProposalStage, StageType } from "@/types/proposal-stage";

import {
  formatCurrentState,
  formatStageName,
  getEffectiveDisplayState,
  getStateStyle,
  isProposalFullyExecuted,
} from "./lifecycle-utils";

const CORE_GOVERNOR = GOVERNORS.core.address;
const TREASURY_GOVERNOR = GOVERNORS.treasury.address;

/** Minimal stages: only `type` and `status` reach the display logic */
function makeStages(
  stages: Array<[StageType, ProposalStage["status"]]>
): ProposalStage[] {
  return stages.map(
    ([type, status]) =>
      ({
        type,
        status,
        chain: "arb1",
        chainId: 42161,
        transactions: [],
        data: {} as ProposalStage["data"],
      }) as ProposalStage
  );
}

describe("lifecycle-utils", () => {
  describe("formatStageName", () => {
    it("converts PROPOSAL_CREATED to Proposal Created", () => {
      expect(formatStageName("PROPOSAL_CREATED")).toBe("Proposal Created");
    });

    it("converts VOTING_ACTIVE to Voting Active", () => {
      expect(formatStageName("VOTING_ACTIVE")).toBe("Voting Active");
    });

    it("converts PROPOSAL_QUEUED to Proposal Queued", () => {
      expect(formatStageName("PROPOSAL_QUEUED")).toBe("Proposal Queued");
    });

    it("converts L2_TIMELOCK to L2 Timelock", () => {
      expect(formatStageName("L2_TIMELOCK")).toBe("L2 Timelock");
    });

    it("converts L2_TO_L1_MESSAGE to L2→L1 Message", () => {
      expect(formatStageName("L2_TO_L1_MESSAGE")).toBe("L2→L1 Message");
    });

    it("converts L1_TIMELOCK to L1 Timelock", () => {
      expect(formatStageName("L1_TIMELOCK")).toBe("L1 Timelock");
    });

    it("converts RETRYABLE_EXECUTED to Retryable Executed", () => {
      expect(formatStageName("RETRYABLE_EXECUTED")).toBe("Retryable Executed");
    });
  });

  describe("formatCurrentState", () => {
    it("returns Unknown for null", () => {
      expect(formatCurrentState(null)).toBe("Unknown");
    });

    it("formats active state", () => {
      expect(formatCurrentState("active")).toBe("Active");
      expect(formatCurrentState("Active")).toBe("Active");
      expect(formatCurrentState("ACTIVE")).toBe("Active");
    });

    it("formats pending state", () => {
      expect(formatCurrentState("pending")).toBe("Pending");
      expect(formatCurrentState("Pending")).toBe("Pending");
    });

    it("formats succeeded as Passed", () => {
      expect(formatCurrentState("succeeded")).toBe("Passed");
      expect(formatCurrentState("Succeeded")).toBe("Passed");
    });

    it("formats executed state", () => {
      expect(formatCurrentState("executed")).toBe("Executed");
      expect(formatCurrentState("Executed")).toBe("Executed");
    });

    it("formats defeated state", () => {
      expect(formatCurrentState("defeated")).toBe("Defeated");
    });

    it("formats queued state", () => {
      expect(formatCurrentState("queued")).toBe("Queued");
    });

    it("formats canceled state", () => {
      expect(formatCurrentState("canceled")).toBe("Canceled");
    });

    it("formats expired state", () => {
      expect(formatCurrentState("expired")).toBe("Expired");
    });

    it("returns original for unknown states", () => {
      expect(formatCurrentState("unknown_state")).toBe("unknown_state");
    });
  });

  describe("getStateStyle", () => {
    it("returns green check for executed", () => {
      const style = getStateStyle("executed");
      expect(style.icon).toBe("check");
      expect(style.color).toBe("text-green-600 dark:text-green-400");
    });

    it("returns green check for Executed (case insensitive)", () => {
      const style = getStateStyle("Executed");
      expect(style.icon).toBe("check");
      expect(style.color).toBe("text-green-600 dark:text-green-400");
    });

    it("returns blue reload for active", () => {
      const style = getStateStyle("active");
      expect(style.icon).toBe("reload");
      expect(style.color).toBe("text-blue-600 dark:text-blue-400");
    });

    it("returns blue reload for pending", () => {
      const style = getStateStyle("pending");
      expect(style.icon).toBe("reload");
      expect(style.color).toBe("text-blue-600 dark:text-blue-400");
    });

    it("returns yellow clock for queued", () => {
      const style = getStateStyle("queued");
      expect(style.icon).toBe("clock");
      expect(style.color).toBe("text-yellow-600 dark:text-yellow-400");
    });

    it("returns yellow clock for succeeded", () => {
      const style = getStateStyle("succeeded");
      expect(style.icon).toBe("clock");
      expect(style.color).toBe("text-yellow-600 dark:text-yellow-400");
    });

    it("returns red cross for defeated", () => {
      const style = getStateStyle("defeated");
      expect(style.icon).toBe("cross");
      expect(style.color).toBe("text-red-600 dark:text-red-400");
    });

    it("returns red cross for canceled", () => {
      const style = getStateStyle("canceled");
      expect(style.icon).toBe("cross");
      expect(style.color).toBe("text-red-600 dark:text-red-400");
    });

    it("returns red cross for expired", () => {
      const style = getStateStyle("expired");
      expect(style.icon).toBe("cross");
      expect(style.color).toBe("text-red-600 dark:text-red-400");
    });

    it("returns muted clock for null", () => {
      const style = getStateStyle(null);
      expect(style.icon).toBe("clock");
      expect(style.color).toBe("text-muted-foreground");
    });

    it("returns muted clock for unknown states", () => {
      const style = getStateStyle("unknown");
      expect(style.icon).toBe("clock");
      expect(style.color).toBe("text-muted-foreground");
    });

    it("returns blue reload for executing", () => {
      const style = getStateStyle("Executing");
      expect(style.icon).toBe("reload");
      expect(style.color).toBe("text-blue-600 dark:text-blue-400");
    });
  });

  describe("getEffectiveDisplayState", () => {
    // Verified on 2026-08-25 against proposal 9950…7943 on the Core Governor:
    // state() answered Executed while the tracker had L2_TO_L1_MESSAGE PENDING
    // and RETRYABLE_EXECUTED NOT_STARTED, i.e. ~10 days still to run.
    const BRIDGING_STAGES = makeStages([
      ["PROPOSAL_CREATED", "COMPLETED"],
      ["VOTING_ACTIVE", "COMPLETED"],
      ["PROPOSAL_QUEUED", "COMPLETED"],
      ["L2_TIMELOCK", "COMPLETED"],
      ["L2_TO_L1_MESSAGE", "PENDING"],
      ["L1_TIMELOCK", "NOT_STARTED"],
      ["RETRYABLE_EXECUTED", "NOT_STARTED"],
    ]);

    const COMPLETED_STAGES = makeStages([
      ["PROPOSAL_CREATED", "COMPLETED"],
      ["VOTING_ACTIVE", "COMPLETED"],
      ["PROPOSAL_QUEUED", "COMPLETED"],
      ["L2_TIMELOCK", "COMPLETED"],
      ["L2_TO_L1_MESSAGE", "COMPLETED"],
      ["L1_TIMELOCK", "COMPLETED"],
      ["RETRYABLE_EXECUTED", "COMPLETED"],
    ]);

    it("calls a Core proposal Executing while it travels through the timelocks", () => {
      const status = getEffectiveDisplayState(
        "Executed",
        BRIDGING_STAGES,
        CORE_GOVERNOR
      );

      expect(status.display).toBe("Executing");
      expect(status.state).toBe("Executing");
      expect(status.isInProgress).toBe(true);
      expect(status.phaseLabel).toBe("Bridging from L2 to L1");
      expect(status.totalStages).toBe(7);
    });

    it("calls it Executed once the retryable ticket has been executed", () => {
      const status = getEffectiveDisplayState(
        "Executed",
        COMPLETED_STAGES,
        CORE_GOVERNOR
      );

      expect(status.display).toBe("Executed");
      expect(status.isInProgress).toBe(false);
      expect(status.currentStage).toBe(7);
    });

    // A stage array is often a prefix of the lifecycle: tracking fills it in as
    // it goes, and a checkpoint saved on a stage boundary holds nothing but
    // COMPLETED stages. gov-tracker's whole-array helpers call that finished,
    // which would put "Executed" back on a proposal in the middle of its round
    // trip, so nothing here may depend on them.
    it("does not call a truncated all-COMPLETED stage list finished", () => {
      const partial = makeStages([
        ["PROPOSAL_CREATED", "COMPLETED"],
        ["VOTING_ACTIVE", "COMPLETED"],
        ["PROPOSAL_QUEUED", "COMPLETED"],
        ["L2_TIMELOCK", "COMPLETED"],
      ]);

      expect(areAllStagesComplete(partial)).toBe(true);
      expect(getLifecyclePhase(partial)).toBe("executed");

      const status = getEffectiveDisplayState(
        "Executed",
        partial,
        CORE_GOVERNOR
      );

      expect(status.display).toBe("Executing");
      expect(status.isInProgress).toBe(true);
      expect(status.currentStage).toBe(5);
      // The phase helper's "executed" is not repeated back to the user
      expect(status.phaseLabel).toBeNull();
    });

    it("counts a Treasury proposal finished at its own final stage", () => {
      const treasuryStages = makeStages([
        ["PROPOSAL_CREATED", "COMPLETED"],
        ["VOTING_ACTIVE", "COMPLETED"],
        ["PROPOSAL_QUEUED", "COMPLETED"],
        ["L2_TIMELOCK", "COMPLETED"],
      ]);

      expect(isProposalFullyExecuted(treasuryStages, TREASURY_GOVERNOR)).toBe(
        true
      );
      expect(isProposalFullyExecuted(treasuryStages, CORE_GOVERNOR)).toBe(
        false
      );
    });

    it("shows Executing for a Core proposal whose trace has not produced stages yet", () => {
      expect(
        getEffectiveDisplayState("Executed", [], CORE_GOVERNOR, true).display
      ).toBe("Executing");
    });

    it("keeps the governor's answer for an untracked Core proposal", () => {
      const status = getEffectiveDisplayState("Executed", [], CORE_GOVERNOR);

      expect(status.display).toBe("Executed");
      expect(status.isInProgress).toBe(false);
      expect(status.phaseLabel).toBeNull();
    });

    it("treats Treasury Executed as final: those proposals never leave L2", () => {
      expect(
        getEffectiveDisplayState("Executed", [], TREASURY_GOVERNOR, true)
          .display
      ).toBe("Executed");
    });

    it("passes every pre-execution state through to the governor's answer", () => {
      expect(
        getEffectiveDisplayState("Queued", BRIDGING_STAGES, CORE_GOVERNOR)
          .display
      ).toBe("Queued");
      expect(
        getEffectiveDisplayState("succeeded", [], CORE_GOVERNOR).display
      ).toBe("Passed");
      expect(getEffectiveDisplayState(null, [], CORE_GOVERNOR).display).toBe(
        "Unknown"
      );
    });
  });
});
