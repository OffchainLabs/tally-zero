import { GOVERNORS } from "@/config/governors";
import { MS_PER_DAY, MS_PER_MINUTE, MS_PER_SECOND } from "@/lib/date-utils";
import type { ProposalStage, StageType } from "@/types/proposal-stage";
import { describe, expect, it } from "vitest";
import {
  MAX_TRACKING_AGE_MS,
  areStagesComplete,
  getCacheKey,
  hasExceededTrackingAge,
  hasReachedFinalStage,
  isCacheExpired,
} from "./stages-cache";

const CORE_GOVERNOR_ADDRESS = GOVERNORS.core.address.toLowerCase();
const TREASURY_GOVERNOR_ADDRESS = GOVERNORS.treasury.address.toLowerCase();

const createStage = (
  type: StageType,
  status: "NOT_STARTED" | "PENDING" | "COMPLETED" | "FAILED"
): ProposalStage => ({
  type,
  status,
  chain: "L2",
  data: {},
  transactions: [],
});

describe("stages-cache", () => {
  describe("getCacheKey", () => {
    it("generates correct key format", () => {
      const key = getCacheKey(
        "12345",
        "0xf07DeD9dC292157749B6Fd268E37DF6EA38395B9"
      );
      expect(key).toBe(
        "tally-zero-stages-0xf07ded9dc292157749b6fd268e37df6ea38395b9-12345"
      );
    });

    it("lowercases governor address", () => {
      const key1 = getCacheKey(
        "12345",
        "0xF07DED9DC292157749B6FD268E37DF6EA38395B9"
      );
      const key2 = getCacheKey(
        "12345",
        "0xf07ded9dc292157749b6fd268e37df6ea38395b9"
      );
      expect(key1).toBe(key2);
    });

    it("handles different proposal IDs", () => {
      const key1 = getCacheKey("111", CORE_GOVERNOR_ADDRESS);
      const key2 = getCacheKey("222", CORE_GOVERNOR_ADDRESS);
      expect(key1).not.toBe(key2);
    });
  });

  describe("areStagesComplete", () => {
    it("returns true for COMPLETED last stage", () => {
      const stages: ProposalStage[] = [
        createStage("PROPOSAL_CREATED", "COMPLETED"),
        createStage("VOTING_ACTIVE", "COMPLETED"),
        createStage("PROPOSAL_QUEUED", "COMPLETED"),
      ];
      expect(areStagesComplete(stages)).toBe(true);
    });

    it("returns true for FAILED last stage", () => {
      const stages: ProposalStage[] = [
        createStage("PROPOSAL_CREATED", "COMPLETED"),
        createStage("VOTING_ACTIVE", "FAILED"),
      ];
      expect(areStagesComplete(stages)).toBe(true);
    });

    it("returns false for PENDING last stage", () => {
      const stages: ProposalStage[] = [
        createStage("PROPOSAL_CREATED", "COMPLETED"),
        createStage("VOTING_ACTIVE", "PENDING"),
      ];
      expect(areStagesComplete(stages)).toBe(false);
    });

    it("returns false for NOT_STARTED last stage", () => {
      const stages: ProposalStage[] = [
        createStage("PROPOSAL_CREATED", "COMPLETED"),
        createStage("VOTING_ACTIVE", "NOT_STARTED"),
      ];
      expect(areStagesComplete(stages)).toBe(false);
    });

    it("returns false for empty stages", () => {
      expect(areStagesComplete([])).toBe(false);
    });

    it("returns false for null/undefined", () => {
      expect(areStagesComplete(null as unknown as ProposalStage[])).toBe(false);
      expect(areStagesComplete(undefined as unknown as ProposalStage[])).toBe(
        false
      );
    });
  });

  describe("hasReachedFinalStage", () => {
    describe("Core Governor", () => {
      it("returns true when RETRYABLE_EXECUTED is COMPLETED", () => {
        // gov-tracker uses consolidated stage types
        const stages: ProposalStage[] = [
          createStage("PROPOSAL_CREATED", "COMPLETED"),
          createStage("VOTING_ACTIVE", "COMPLETED"),
          createStage("PROPOSAL_QUEUED", "COMPLETED"),
          createStage("L2_TIMELOCK", "COMPLETED"),
          createStage("L2_TO_L1_MESSAGE", "COMPLETED"),
          createStage("L1_TIMELOCK", "COMPLETED"),
          createStage("RETRYABLE_EXECUTED", "COMPLETED"),
        ];
        expect(hasReachedFinalStage(stages, CORE_GOVERNOR_ADDRESS)).toBe(true);
      });

      it("returns false when not at RETRYABLE_EXECUTED", () => {
        const stages: ProposalStage[] = [
          createStage("PROPOSAL_CREATED", "COMPLETED"),
          createStage("VOTING_ACTIVE", "COMPLETED"),
          createStage("PROPOSAL_QUEUED", "COMPLETED"),
          createStage("L2_TIMELOCK", "COMPLETED"),
        ];
        expect(hasReachedFinalStage(stages, CORE_GOVERNOR_ADDRESS)).toBe(false);
      });
    });

    describe("Treasury Governor", () => {
      it("returns true when L2_TIMELOCK is COMPLETED", () => {
        const stages: ProposalStage[] = [
          createStage("PROPOSAL_CREATED", "COMPLETED"),
          createStage("VOTING_ACTIVE", "COMPLETED"),
          createStage("PROPOSAL_QUEUED", "COMPLETED"),
          createStage("L2_TIMELOCK", "COMPLETED"),
        ];
        expect(hasReachedFinalStage(stages, TREASURY_GOVERNOR_ADDRESS)).toBe(
          true
        );
      });

      it("returns false when only PROPOSAL_QUEUED is COMPLETED", () => {
        const stages: ProposalStage[] = [
          createStage("PROPOSAL_CREATED", "COMPLETED"),
          createStage("VOTING_ACTIVE", "COMPLETED"),
          createStage("PROPOSAL_QUEUED", "COMPLETED"),
        ];
        expect(hasReachedFinalStage(stages, TREASURY_GOVERNOR_ADDRESS)).toBe(
          false
        );
      });
    });

    it("returns true for any FAILED proposal", () => {
      const stages: ProposalStage[] = [
        createStage("PROPOSAL_CREATED", "COMPLETED"),
        createStage("VOTING_ACTIVE", "FAILED"),
      ];
      expect(hasReachedFinalStage(stages, CORE_GOVERNOR_ADDRESS)).toBe(true);
      expect(hasReachedFinalStage(stages, TREASURY_GOVERNOR_ADDRESS)).toBe(
        true
      );
    });

    it("handles unknown governor with basic completion", () => {
      const unknownGovernor = "0x1234567890123456789012345678901234567890";
      const stages: ProposalStage[] = [
        createStage("PROPOSAL_CREATED", "COMPLETED"),
        createStage("VOTING_ACTIVE", "COMPLETED"),
      ];
      expect(hasReachedFinalStage(stages, unknownGovernor)).toBe(true);
    });

    it("returns false for empty stages", () => {
      expect(hasReachedFinalStage([], CORE_GOVERNOR_ADDRESS)).toBe(false);
    });

    it("handles case-insensitive governor addresses", () => {
      const stages: ProposalStage[] = [
        createStage("PROPOSAL_CREATED", "COMPLETED"),
        createStage("VOTING_ACTIVE", "COMPLETED"),
        createStage("PROPOSAL_QUEUED", "COMPLETED"),
        createStage("L2_TIMELOCK", "COMPLETED"),
      ];
      expect(
        hasReachedFinalStage(stages, TREASURY_GOVERNOR_ADDRESS.toUpperCase())
      ).toBe(true);
    });
  });

  describe("hasExceededTrackingAge", () => {
    it("returns false when no stagesTrackedAt", () => {
      expect(hasExceededTrackingAge(undefined, new Date())).toBe(false);
    });

    it("returns false within 60 days", () => {
      const createdAt = new Date();
      // Tracked 30 days after creation
      const trackedAt = new Date(createdAt.getTime() + 30 * MS_PER_DAY);
      expect(hasExceededTrackingAge(trackedAt.toISOString(), createdAt)).toBe(
        false
      );
    });

    it("returns true after 60 days", () => {
      const createdAt = new Date();
      // Tracked 61 days after creation
      const trackedAt = new Date(createdAt.getTime() + 61 * MS_PER_DAY);
      expect(hasExceededTrackingAge(trackedAt.toISOString(), createdAt)).toBe(
        true
      );
    });

    it("returns true exactly at 60 days boundary", () => {
      const createdAt = new Date();
      // Tracked exactly 60 days + 1ms after creation
      const trackedAt = new Date(createdAt.getTime() + MAX_TRACKING_AGE_MS + 1);
      expect(hasExceededTrackingAge(trackedAt.toISOString(), createdAt)).toBe(
        true
      );
    });

    it("handles numeric timestamp for proposalCreatedAt", () => {
      const createdTime = Date.now();
      // Tracked 70 days after creation
      const trackedAt = new Date(createdTime + 70 * MS_PER_DAY);
      expect(hasExceededTrackingAge(trackedAt.toISOString(), createdTime)).toBe(
        true
      );
    });
  });

  describe("isCacheExpired", () => {
    it("returns true when no stagesTrackedAt", () => {
      expect(isCacheExpired(undefined)).toBe(true);
    });

    it("returns false within default TTL", () => {
      // Tracked 1 minute ago
      const trackedAt = new Date(Date.now() - MS_PER_MINUTE);
      expect(isCacheExpired(trackedAt.toISOString())).toBe(false);
    });

    it("returns true after default TTL", () => {
      // Default TTL is typically several hours, let's test with a very old timestamp
      const trackedAt = new Date(Date.now() - MS_PER_DAY); // 24 hours ago
      expect(isCacheExpired(trackedAt.toISOString())).toBe(true);
    });

    it("respects custom TTL", () => {
      const trackedAt = new Date(Date.now() - 5 * MS_PER_SECOND); // 5 seconds ago
      // Should be expired with 1 second TTL
      expect(isCacheExpired(trackedAt.toISOString(), MS_PER_SECOND)).toBe(true);
      // Should not be expired with 10 second TTL
      expect(isCacheExpired(trackedAt.toISOString(), 10 * MS_PER_SECOND)).toBe(
        false
      );
    });

    it("handles edge case at exactly TTL boundary", () => {
      const ttlMs = 5 * MS_PER_SECOND;
      const trackedAt = new Date(Date.now() - ttlMs - 1);
      expect(isCacheExpired(trackedAt.toISOString(), ttlMs)).toBe(true);
    });
  });
});
