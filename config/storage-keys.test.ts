import { describe, expect, it } from "vitest";

import {
  MS_PER_HOUR,
  SECONDS_PER_DAY,
  SECONDS_PER_HOUR,
  SECONDS_PER_MINUTE,
} from "@/lib/date-utils";

import {
  CACHE_TTL_CHECK_INTERVAL_MS,
  CACHE_TTL_OPTIONS,
  CACHE_VERSION,
  COPY_SUCCESS_TIMEOUT_MS,
  DEFAULT_CACHE_TTL_MS,
  DEFAULT_TENDERLY_ORG,
  DEFAULT_TENDERLY_PROJECT,
  L1_BLOCK_CACHE_FRESHNESS_MS,
  L1_BLOCK_REFRESH_INTERVAL_MS,
  PROPOSAL_DRAFT_AUTOSAVE_INTERVAL_MS,
  STORAGE_KEYS,
  STORAGE_PREFIX,
} from "./storage-keys";

describe("storage-keys config", () => {
  describe("STORAGE_PREFIX", () => {
    it("has the correct value", () => {
      expect(STORAGE_PREFIX).toBe("tally-zero");
    });
  });

  describe("STORAGE_KEYS", () => {
    it("has correct prefix for all keys", () => {
      const keys = Object.values(STORAGE_KEYS);
      keys.forEach((key) => {
        expect(key).toMatch(new RegExp(`^${STORAGE_PREFIX}-`));
      });
    });

    it("has L1_RPC key", () => {
      expect(STORAGE_KEYS.L1_RPC).toBe("tally-zero-l1-rpc");
    });

    it("has L2_RPC key", () => {
      expect(STORAGE_KEYS.L2_RPC).toBe("tally-zero-l2-rpc");
    });

    it("has PROPOSAL_DRAFT key", () => {
      expect(STORAGE_KEYS.PROPOSAL_DRAFT).toBe("tally-zero-proposal-draft");
    });

    it("has BLOCK_RANGE key", () => {
      expect(STORAGE_KEYS.BLOCK_RANGE).toBe("tally-zero-block-range");
    });

    it("has L1_BLOCK_RANGE key", () => {
      expect(STORAGE_KEYS.L1_BLOCK_RANGE).toBe("tally-zero-l1-block-range");
    });

    it("has STAGES_CACHE_PREFIX key", () => {
      expect(STORAGE_KEYS.STAGES_CACHE_PREFIX).toBe("tally-zero-stages-");
    });

    it("has DAYS_TO_SEARCH key", () => {
      expect(STORAGE_KEYS.DAYS_TO_SEARCH).toBe("tally-zero-days-to-search");
    });

    it("has NERD_MODE key", () => {
      expect(STORAGE_KEYS.NERD_MODE).toBe("tally-zero-nerd-mode");
    });

    it("has CACHE_TTL key", () => {
      expect(STORAGE_KEYS.CACHE_TTL).toBe("tally-zero-cache-ttl");
    });

    it("has SKIP_BUNDLED_CACHE key", () => {
      expect(STORAGE_KEYS.SKIP_BUNDLED_CACHE).toBe(
        "tally-zero-skip-bundled-cache"
      );
    });

    it("has SKIP_DELEGATE_CACHE key", () => {
      expect(STORAGE_KEYS.SKIP_DELEGATE_CACHE).toBe(
        "tally-zero-skip-delegate-cache"
      );
    });

    it("has DELEGATE_MIN_POWER key", () => {
      expect(STORAGE_KEYS.DELEGATE_MIN_POWER).toBe(
        "tally-zero-delegate-min-power"
      );
    });

    it("has Tenderly configuration keys", () => {
      expect(STORAGE_KEYS.TENDERLY_ORG).toBe("tally-zero-tenderly-org");
      expect(STORAGE_KEYS.TENDERLY_PROJECT).toBe("tally-zero-tenderly-project");
      expect(STORAGE_KEYS.TENDERLY_ACCESS_TOKEN).toBe(
        "tally-zero-tenderly-access-token"
      );
    });

    it("has unique keys", () => {
      const keys = Object.values(STORAGE_KEYS);
      const uniqueKeys = new Set(keys);
      expect(uniqueKeys.size).toBe(keys.length);
    });
  });

  describe("DEFAULT_TENDERLY constants", () => {
    it("has default org placeholder", () => {
      expect(DEFAULT_TENDERLY_ORG).toBe("ORG");
    });

    it("has default project placeholder", () => {
      expect(DEFAULT_TENDERLY_PROJECT).toBe("PROJECT");
    });
  });

  describe("CACHE_VERSION", () => {
    it("is a positive integer", () => {
      expect(Number.isInteger(CACHE_VERSION)).toBe(true);
      expect(CACHE_VERSION).toBeGreaterThan(0);
    });
  });

  describe("DEFAULT_CACHE_TTL_MS", () => {
    it("equals 1 hour in milliseconds", () => {
      expect(DEFAULT_CACHE_TTL_MS).toBe(MS_PER_HOUR);
      expect(DEFAULT_CACHE_TTL_MS).toBe(3600000);
    });
  });

  describe("timing constants", () => {
    it("COPY_SUCCESS_TIMEOUT_MS is 2 seconds", () => {
      expect(COPY_SUCCESS_TIMEOUT_MS).toBe(2000);
    });

    it("CACHE_TTL_CHECK_INTERVAL_MS is 30 seconds", () => {
      expect(CACHE_TTL_CHECK_INTERVAL_MS).toBe(30000);
    });

    it("L1_BLOCK_REFRESH_INTERVAL_MS is 1 minute", () => {
      expect(L1_BLOCK_REFRESH_INTERVAL_MS).toBe(60000);
    });

    it("L1_BLOCK_CACHE_FRESHNESS_MS is 30 seconds", () => {
      expect(L1_BLOCK_CACHE_FRESHNESS_MS).toBe(30000);
    });

    it("PROPOSAL_DRAFT_AUTOSAVE_INTERVAL_MS is 5 minutes", () => {
      expect(PROPOSAL_DRAFT_AUTOSAVE_INTERVAL_MS).toBe(300000);
    });
  });

  describe("CACHE_TTL_OPTIONS", () => {
    it("has multiple options", () => {
      expect(CACHE_TTL_OPTIONS.length).toBeGreaterThan(0);
    });

    it("options have label and value", () => {
      CACHE_TTL_OPTIONS.forEach((option) => {
        expect(option).toHaveProperty("label");
        expect(option).toHaveProperty("value");
        expect(typeof option.label).toBe("string");
        expect(typeof option.value).toBe("number");
      });
    });

    it("values are in ascending order", () => {
      for (let i = 1; i < CACHE_TTL_OPTIONS.length; i++) {
        expect(CACHE_TTL_OPTIONS[i].value).toBeGreaterThan(
          CACHE_TTL_OPTIONS[i - 1].value
        );
      }
    });

    it("includes expected time options", () => {
      const values = CACHE_TTL_OPTIONS.map((o) => o.value);
      expect(values).toContain(15 * SECONDS_PER_MINUTE); // 15 min
      expect(values).toContain(30 * SECONDS_PER_MINUTE); // 30 min
      expect(values).toContain(SECONDS_PER_HOUR); // 1 hour
      expect(values).toContain(2 * SECONDS_PER_HOUR); // 2 hours
      expect(values).toContain(6 * SECONDS_PER_HOUR); // 6 hours
      expect(values).toContain(SECONDS_PER_DAY); // 24 hours
    });

    it("has human-readable labels", () => {
      const labels = CACHE_TTL_OPTIONS.map((o) => o.label);
      expect(labels).toContain("15 min");
      expect(labels).toContain("30 min");
      expect(labels).toContain("1 hour");
      expect(labels).toContain("2 hours");
      expect(labels).toContain("6 hours");
      expect(labels).toContain("24 hours");
    });
  });
});
