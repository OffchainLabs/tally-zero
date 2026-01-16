import { beforeEach, describe, expect, it, vi } from "vitest";

import { CACHE_VERSION, STORAGE_KEYS } from "@/config/storage-keys";
import type {
  TimelockOperationInfo,
  TimelockTrackingResult,
} from "@/hooks/use-timelock-operation";
import { MS_PER_HOUR, MS_PER_SECOND } from "@/lib/date-utils";
import type { ProposalStage } from "@/types/proposal-stage";
import {
  clearCachedTimelockResult,
  getTimelockCacheKey,
  hasTimelockCache,
  loadCachedTimelockResult,
  saveCachedTimelockResult,
} from "./unified-cache";

// Helper to create minimal mock stage
function createMockStage(
  type: ProposalStage["type"],
  status: ProposalStage["status"]
): ProposalStage {
  return {
    type,
    status,
    chain: "arb1",
    chainId: 42161,
    data: {},
    transactions: [],
  } as ProposalStage;
}

// Helper to create minimal mock operation info
function createMockOperationInfo(): TimelockOperationInfo {
  return {
    txHash: "0x123",
    operationId: "0x456",
    timelockAddress: "0xtimelock",
    target: "0x0000000000000000000000000000000000000001",
    value: "0",
    data: "0x",
    predecessor:
      "0x0000000000000000000000000000000000000000000000000000000000000000",
    delay: "0",
    blockNumber: 12345,
    timestamp: Date.now(),
  };
}

// Helper to create mock timelock tracking result
function createMockTimelockResult(
  stages: ProposalStage[]
): TimelockTrackingResult {
  return {
    operationInfo: createMockOperationInfo(),
    stages,
  };
}

// Mock localStorage
const mockStorage: Record<string, string> = {};
const mockLocalStorage = {
  getItem: vi.fn((key: string) => mockStorage[key] ?? null),
  setItem: vi.fn((key: string, value: string) => {
    mockStorage[key] = value;
  }),
  removeItem: vi.fn((key: string) => {
    delete mockStorage[key];
  }),
  clear: vi.fn(() => {
    Object.keys(mockStorage).forEach((key) => delete mockStorage[key]);
  }),
};

vi.stubGlobal("window", { localStorage: mockLocalStorage });
vi.stubGlobal("localStorage", mockLocalStorage);

// Mock the isBrowser check from debug module
vi.mock("./debug", () => ({
  isBrowser: true,
  debug: {
    cache: vi.fn(),
  },
}));

describe("unified-cache (timelock operations)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLocalStorage.clear();
  });

  describe("getTimelockCacheKey", () => {
    it("generates consistent cache keys", () => {
      const key = getTimelockCacheKey("0xABC123", "0xDEF456");
      expect(key).toBe(
        `${STORAGE_KEYS.TIMELOCK_OP_CACHE_PREFIX}0xabc123-0xdef456`
      );
    });

    it("normalizes to lowercase", () => {
      const key1 = getTimelockCacheKey("0xABC", "0xDEF");
      const key2 = getTimelockCacheKey("0xabc", "0xdef");
      expect(key1).toBe(key2);
    });
  });

  describe("saveCachedTimelockResult", () => {
    it("saves result to localStorage", () => {
      const result = createMockTimelockResult([
        createMockStage("L2_TIMELOCK", "COMPLETED"),
      ]);

      saveCachedTimelockResult("0x123", "0x456", result);

      expect(mockLocalStorage.setItem).toHaveBeenCalled();
      const savedKey = mockLocalStorage.setItem.mock.calls[0][0];
      const savedValue = JSON.parse(mockLocalStorage.setItem.mock.calls[0][1]);

      expect(savedKey).toContain("0x123");
      expect(savedValue.version).toBe(CACHE_VERSION);
      expect(savedValue.result).toEqual(result);
      expect(savedValue.timestamp).toBeGreaterThan(0);
    });
  });

  describe("loadCachedTimelockResult", () => {
    it("returns null for non-existent cache", () => {
      const { result, isExpired } = loadCachedTimelockResult("0x123", "0x456");
      expect(result).toBeNull();
      expect(isExpired).toBe(false);
    });

    it("loads cached result", () => {
      const cachedResult = createMockTimelockResult([
        createMockStage("L2_TIMELOCK", "COMPLETED"),
      ]);
      const cached = {
        version: CACHE_VERSION,
        timestamp: Date.now(),
        result: cachedResult,
      };
      const key = getTimelockCacheKey("0x123", "0x456");
      mockStorage[key] = JSON.stringify(cached);

      const { result, isExpired } = loadCachedTimelockResult("0x123", "0x456");
      expect(result).toEqual(cachedResult);
      expect(isExpired).toBe(false);
    });

    it("marks expired cache correctly", () => {
      const cached = {
        version: CACHE_VERSION,
        timestamp: Date.now() - MS_PER_HOUR, // 1 hour ago
        result: createMockTimelockResult([]),
      };
      const key = getTimelockCacheKey("0x123", "0x456");
      mockStorage[key] = JSON.stringify(cached);

      // With 30 second TTL, cache should be expired
      const { isExpired } = loadCachedTimelockResult(
        "0x123",
        "0x456",
        30 * MS_PER_SECOND
      );
      expect(isExpired).toBe(true);
    });

    it("returns null for wrong cache version", () => {
      const cached = {
        version: CACHE_VERSION - 1,
        timestamp: Date.now(),
        result: createMockTimelockResult([]),
      };
      const key = getTimelockCacheKey("0x123", "0x456");
      mockStorage[key] = JSON.stringify(cached);

      const { result } = loadCachedTimelockResult("0x123", "0x456");
      expect(result).toBeNull();
    });

    it("handles malformed JSON gracefully", () => {
      const key = getTimelockCacheKey("0x123", "0x456");
      mockStorage[key] = "not valid json";

      const { result } = loadCachedTimelockResult("0x123", "0x456");
      expect(result).toBeNull();
    });
  });

  describe("clearCachedTimelockResult", () => {
    it("removes cache from localStorage", () => {
      const key = getTimelockCacheKey("0x123", "0x456");
      mockStorage[key] = JSON.stringify({ version: CACHE_VERSION });

      clearCachedTimelockResult("0x123", "0x456");

      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith(key);
    });
  });

  describe("hasTimelockCache", () => {
    it("returns false for non-existent cache", () => {
      expect(hasTimelockCache("0x123", "0x456")).toBe(false);
    });

    it("returns false for empty stages", () => {
      const cached = {
        version: CACHE_VERSION,
        timestamp: Date.now(),
        result: createMockTimelockResult([]),
      };
      const key = getTimelockCacheKey("0x123", "0x456");
      mockStorage[key] = JSON.stringify(cached);

      expect(hasTimelockCache("0x123", "0x456")).toBe(false);
    });

    it("returns true for valid cache with stages", () => {
      const cached = {
        version: CACHE_VERSION,
        timestamp: Date.now(),
        result: createMockTimelockResult([
          createMockStage("L2_TIMELOCK", "COMPLETED"),
        ]),
      };
      const key = getTimelockCacheKey("0x123", "0x456");
      mockStorage[key] = JSON.stringify(cached);

      expect(hasTimelockCache("0x123", "0x456")).toBe(true);
    });

    it("returns false for wrong version", () => {
      const cached = {
        version: CACHE_VERSION - 1,
        timestamp: Date.now(),
        result: createMockTimelockResult([
          createMockStage("L2_TIMELOCK", "COMPLETED"),
        ]),
      };
      const key = getTimelockCacheKey("0x123", "0x456");
      mockStorage[key] = JSON.stringify(cached);

      expect(hasTimelockCache("0x123", "0x456")).toBe(false);
    });
  });
});
