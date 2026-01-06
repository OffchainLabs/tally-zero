/**
 * Tests for settings utilities
 */

import { describe, expect, it } from "vitest";

import {
  SECONDS_PER_DAY,
  SECONDS_PER_HOUR,
  SECONDS_PER_MINUTE,
} from "@/lib/date-utils";

import { formatTtl } from "./settings-utils";

describe("formatTtl", () => {
  it("formats seconds only", () => {
    expect(formatTtl(0)).toBe("0s");
    expect(formatTtl(1)).toBe("1s");
    expect(formatTtl(30)).toBe("30s");
    expect(formatTtl(SECONDS_PER_MINUTE - 1)).toBe("59s");
  });

  it("formats minutes and seconds", () => {
    expect(formatTtl(SECONDS_PER_MINUTE)).toBe("1m 0s");
    expect(formatTtl(SECONDS_PER_MINUTE + 1)).toBe("1m 1s");
    expect(formatTtl(SECONDS_PER_MINUTE + 30)).toBe("1m 30s");
    expect(formatTtl(2 * SECONDS_PER_MINUTE)).toBe("2m 0s");
    expect(formatTtl(SECONDS_PER_HOUR - 1)).toBe("59m 59s");
  });

  it("formats hours and minutes", () => {
    expect(formatTtl(SECONDS_PER_HOUR)).toBe("1h 0m");
    expect(formatTtl(SECONDS_PER_HOUR + SECONDS_PER_MINUTE)).toBe("1h 1m");
    expect(formatTtl(2 * SECONDS_PER_HOUR)).toBe("2h 0m");
    expect(formatTtl(2 * SECONDS_PER_HOUR + SECONDS_PER_MINUTE)).toBe("2h 1m");
    expect(formatTtl(SECONDS_PER_DAY)).toBe("24h 0m");
  });

  it("handles common cache duration values", () => {
    expect(formatTtl(15 * SECONDS_PER_MINUTE)).toBe("15m 0s"); // 15 minutes
    expect(formatTtl(30 * SECONDS_PER_MINUTE)).toBe("30m 0s"); // 30 minutes
    expect(formatTtl(SECONDS_PER_HOUR)).toBe("1h 0m"); // 1 hour
    expect(formatTtl(2 * SECONDS_PER_HOUR)).toBe("2h 0m"); // 2 hours
    expect(formatTtl(6 * SECONDS_PER_HOUR)).toBe("6h 0m"); // 6 hours
    expect(formatTtl(SECONDS_PER_DAY)).toBe("24h 0m"); // 24 hours
  });
});
