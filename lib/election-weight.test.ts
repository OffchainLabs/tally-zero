import type { SerializableMemberDetails } from "@gzeoneth/gov-tracker";
import { describe, expect, it } from "vitest";

import {
  computeWeightInfo,
  FULL_WEIGHT_DAYS,
  getWeight,
  TOTAL_DAYS,
} from "./election-weight";

// Realistic L1 magnitudes, so a precision bug is visible rather than hidden by
// toy numbers. 14 days of decay at ~12s/block:
//   duration    = 23_100_800 - 23_000_000 = 100_800
//   totalBlocks = duration * 3 / 2        = 151_200  (the full 21-day span)
//   startBlock  = 23_100_800 - 151_200    = 22_949_600
const DEADLINE = 23_000_000;
const END_BLOCK = 23_100_800;
const DURATION = BigInt(END_BLOCK - DEADLINE);
const TOTAL_BLOCKS = (DURATION * BigInt(3)) / BigInt(2);
const START_BLOCK = BigInt(END_BLOCK) - TOTAL_BLOCKS;

function makeMemberDetails(
  overrides: Partial<SerializableMemberDetails> = {}
): SerializableMemberDetails {
  return {
    fullWeightDeadline: DEADLINE,
    proposalDeadline: END_BLOCK,
    ...overrides,
  } as SerializableMemberDetails;
}

describe("computeWeightInfo", () => {
  describe("guards", () => {
    // Each of these is reachable from a stale cache, so they must return
    // undefined rather than a plausible-looking weight.
    it("returns undefined without member details", () => {
      expect(computeWeightInfo(null, BigInt(DEADLINE))).toBeUndefined();
    });

    it("returns undefined without a current block", () => {
      expect(computeWeightInfo(makeMemberDetails(), undefined)).toBeUndefined();
    });

    it("returns undefined for a zero full-weight deadline", () => {
      const details = makeMemberDetails({ fullWeightDeadline: 0 });
      expect(computeWeightInfo(details, BigInt(DEADLINE))).toBeUndefined();
    });

    it("returns undefined for a zero proposal deadline", () => {
      const details = makeMemberDetails({ proposalDeadline: 0 });
      expect(computeWeightInfo(details, BigInt(DEADLINE))).toBeUndefined();
    });

    it("returns undefined when the deadlines are equal", () => {
      const details = makeMemberDetails({ proposalDeadline: DEADLINE });
      expect(computeWeightInfo(details, BigInt(DEADLINE))).toBeUndefined();
    });

    it("returns undefined when the deadlines are inverted", () => {
      const details = makeMemberDetails({
        proposalDeadline: DEADLINE - 1,
      });
      expect(computeWeightInfo(details, BigInt(DEADLINE))).toBeUndefined();
    });
  });

  describe("full-weight plateau", () => {
    it("reports full weight before the deadline", () => {
      const info = computeWeightInfo(makeMemberDetails(), BigInt(DEADLINE - 1));
      expect(info?.pct).toBe(100);
    });

    it("reports full weight exactly at the deadline", () => {
      // The comparison is `<=`, so the deadline block itself is still full weight.
      const info = computeWeightInfo(makeMemberDetails(), BigInt(DEADLINE));
      expect(info?.pct).toBe(100);
    });

    it("reports the decay length as `remaining` while on the plateau", () => {
      // On the plateau `remaining` is the decay length, NOT `endBlock - current`.
      // Asserted explicitly so a future "cleanup" of that line is caught here.
      const info = computeWeightInfo(
        makeMemberDetails(),
        BigInt(DEADLINE - 500)
      );
      expect(info?.remaining).toBe(DURATION);
      expect(info?.duration).toBe(DURATION);
    });

    it("counts elapsed days on the plateau even though weight is still 100%", () => {
      // elapsedDays is computed before the early returns, so a block between the
      // election start and the full-weight deadline yields a non-zero day at
      // 100% weight. That looks like a bug and is not: days 0-7 are full weight.
      const info = computeWeightInfo(makeMemberDetails(), BigInt(DEADLINE - 1));
      expect(info?.pct).toBe(100);
      expect(info?.elapsedDays).toBeGreaterThan(0);
      expect(info?.elapsedDays).toBeLessThanOrEqual(FULL_WEIGHT_DAYS);
    });

    it("floors elapsed days before the election starts", () => {
      const info = computeWeightInfo(
        makeMemberDetails(),
        START_BLOCK - BigInt(1)
      );
      expect(info?.elapsedDays).toBe(0);
      expect(info?.pct).toBe(100);
    });
  });

  describe("exhausted", () => {
    it("reports zero weight exactly at the end block", () => {
      const info = computeWeightInfo(makeMemberDetails(), BigInt(END_BLOCK));
      expect(info?.pct).toBe(0);
      expect(info?.remaining).toBe(BigInt(0));
      expect(info?.elapsedDays).toBe(TOTAL_DAYS);
    });

    it("reports zero weight past the end block", () => {
      const info = computeWeightInfo(
        makeMemberDetails(),
        BigInt(END_BLOCK + 10_000)
      );
      expect(info?.pct).toBe(0);
      expect(info?.remaining).toBe(BigInt(0));
    });

    it("reports exactly the total day count however far past the end we are", () => {
      // Note this pins the hardcoded `elapsedDays: 21` on the exhausted branch,
      // not the `Math.min` clamp above it. That clamp is unreachable: below
      // endBlock, elapsed < totalBlocks so the ratio is always < 1, and at or
      // past endBlock this branch has already returned. Mutating the clamp
      // bound therefore fails no test, by design rather than by omission.
      const info = computeWeightInfo(
        makeMemberDetails(),
        BigInt(END_BLOCK) + TOTAL_BLOCKS
      );
      expect(info?.elapsedDays).toBe(TOTAL_DAYS);
      expect(info?.elapsedDays).not.toBeGreaterThan(TOTAL_DAYS);
    });
  });

  describe("decay", () => {
    it("is at half weight halfway through the decay window", () => {
      const midpoint = BigInt(DEADLINE) + DURATION / BigInt(2);
      const info = computeWeightInfo(makeMemberDetails(), midpoint);
      expect(info?.pct).toBeCloseTo(50, 9);
      expect(info?.elapsedDays).toBeCloseTo(14, 9);
    });

    it("leaves the plateau at a block, not a day", () => {
      // One block past the deadline must already be below 100%, which pins that
      // the plateau boundary is block-precise rather than rounded to a day.
      const info = computeWeightInfo(makeMemberDetails(), BigInt(DEADLINE + 1));
      expect(info?.pct).toBeLessThan(100);
      expect(info?.pct).toBeGreaterThan(99.99);
    });

    it("decreases monotonically across the decay window", () => {
      const samples = Array.from({ length: 20 }, (_, i) => {
        const block = BigInt(DEADLINE) + (DURATION * BigInt(i)) / BigInt(19);
        return computeWeightInfo(makeMemberDetails(), block)?.pct ?? NaN;
      });
      for (let i = 1; i < samples.length; i += 1) {
        expect(samples[i]).toBeLessThanOrEqual(samples[i - 1]!);
      }
    });

    it("truncates the total span on an odd decay duration", () => {
      // totalBlocks = duration * 3n / 2n, so an odd duration truncates. Pinned so
      // a refactor to float math changes a test rather than silently the curve.
      const oddEnd = DEADLINE + 101;
      const details = makeMemberDetails({ proposalDeadline: oddEnd });
      const info = computeWeightInfo(details, BigInt(DEADLINE));
      expect(info?.duration).toBe(BigInt(101));
      // (101 * 3) / 2 === 151 after truncation, not 151.5
      expect(info?.elapsedDays).toBeCloseTo((50 / 151) * TOTAL_DAYS, 9);
    });
  });

  describe("cross-implementation agreement with getWeight", () => {
    // The decay curve exists twice: here over bigint L1 blocks, and in getWeight
    // over float days for the chart. Nothing in the types forces them to agree,
    // so the banner percentage and the plotted curve could silently diverge.
    it("matches getWeight across the whole election span", () => {
      const points = 30;
      for (let i = 0; i <= points; i += 1) {
        const block = START_BLOCK + (TOTAL_BLOCKS * BigInt(i)) / BigInt(points);
        const info = computeWeightInfo(makeMemberDetails(), block);
        expect(info).toBeDefined();
        expect(Math.abs(getWeight(info!.elapsedDays) - info!.pct)).toBeLessThan(
          1e-6
        );
      }
    });
  });

  describe("clock hazards", () => {
    it("reads an L2-magnitude block as a finished election", () => {
      // The function cannot detect that it was handed the L2 clock instead of the
      // L1 one; it simply reports weight exhausted. Documented here so the failure
      // mode is known rather than mistaken for correct behaviour.
      const info = computeWeightInfo(makeMemberDetails(), BigInt(400_000_000));
      expect(info?.pct).toBe(0);
      expect(info?.elapsedDays).toBe(TOTAL_DAYS);
    });

    it("handles a single-block decay window without dividing by zero", () => {
      const details = makeMemberDetails({
        proposalDeadline: DEADLINE + 1,
      });
      const info = computeWeightInfo(details, BigInt(DEADLINE + 1));
      expect(info?.pct).toBe(0);
      expect(Number.isFinite(info?.elapsedDays)).toBe(true);
    });
  });
});

describe("getWeight", () => {
  it("is flat through the full-weight days", () => {
    expect(getWeight(0)).toBe(100);
    expect(getWeight(FULL_WEIGHT_DAYS)).toBe(100);
  });

  it("is zero at and past the end of the span", () => {
    expect(getWeight(TOTAL_DAYS)).toBe(0);
    expect(getWeight(TOTAL_DAYS + 5)).toBe(0);
  });

  it("is half weight at the midpoint of the decay window", () => {
    expect(getWeight((FULL_WEIGHT_DAYS + TOTAL_DAYS) / 2)).toBeCloseTo(50, 9);
  });
});
