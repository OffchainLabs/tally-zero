import { beforeEach, describe, expect, it, vi } from "vitest";

import { CACHE_VERSION, STORAGE_KEYS } from "@/config/storage-keys";
import type {
  TimelockOperationInfo,
  TimelockTrackingResult,
} from "@/hooks/use-timelock-operation";
import { MS_PER_HOUR, MS_PER_SECOND } from "@/lib/date-utils";
import type { ProposalStage, TimelockLink } from "@/types/proposal-stage";
import {
  clearCachedTimelockResult,
  getRefreshNeeds,
  getTimelockCacheKey,
  hasTimelockCache,
  loadCachedTimelockResult,
  loadUnifiedStages,
  needsRefresh,
  saveCachedTimelockResult,
  seedTimelockFromCache,
  type UnifiedCacheResult,
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

// Helper to create mock timelock link
function createMockTimelockLink(
  txHash: string = "0xtx",
  operationId: string = "0xop"
): TimelockLink {
  return {
    txHash,
    operationId,
    timelockAddress: "0xtimelock",
    queueBlockNumber: 12345,
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

describe("unified-cache", () => {
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

  describe("seedTimelockFromCache", () => {
    it("seeds cache when empty", () => {
      const result = createMockTimelockResult([
        createMockStage("L2_TIMELOCK", "COMPLETED"),
      ]);

      const seeded = seedTimelockFromCache("0x123", "0x456", result);

      expect(seeded).toBe(true);
      expect(mockLocalStorage.setItem).toHaveBeenCalled();
    });

    it("skips seeding when existing has more stages", () => {
      const existing = {
        version: CACHE_VERSION,
        timestamp: Date.now(),
        result: createMockTimelockResult([
          createMockStage("L2_TIMELOCK", "COMPLETED"),
          createMockStage("L2_TO_L1_MESSAGE", "COMPLETED"),
        ]),
      };
      const key = getTimelockCacheKey("0x123", "0x456");
      mockStorage[key] = JSON.stringify(existing);

      const newResult = createMockTimelockResult([
        createMockStage("L2_TIMELOCK", "COMPLETED"),
      ]);

      const seeded = seedTimelockFromCache("0x123", "0x456", newResult);

      expect(seeded).toBe(false);
    });

    it("uses provided trackedAt timestamp", () => {
      const result = createMockTimelockResult([
        createMockStage("L2_TIMELOCK", "COMPLETED"),
      ]);

      seedTimelockFromCache(
        "0x123",
        "0x456",
        result,
        "2024-01-15T12:00:00.000Z"
      );

      const savedValue = JSON.parse(mockLocalStorage.setItem.mock.calls[0][1]);
      expect(savedValue.timestamp).toBe(
        new Date("2024-01-15T12:00:00.000Z").getTime()
      );
    });
  });

  describe("needsRefresh", () => {
    it("returns false when complete", () => {
      const result: UnifiedCacheResult = {
        stages: [],
        proposalCacheExpired: true,
        timelockCacheExpired: true,
        completionStatus: "completed",
        isComplete: true,
        proposalResult: null,
        timelockResult: null,
      };

      expect(needsRefresh(result)).toBe(false);
    });

    it("returns true when proposal cache expired and not complete", () => {
      const result: UnifiedCacheResult = {
        stages: [],
        proposalCacheExpired: true,
        timelockCacheExpired: false,
        completionStatus: "pending",
        isComplete: false,
        proposalResult: null,
        timelockResult: null,
      };

      expect(needsRefresh(result)).toBe(true);
    });

    it("returns true when timelock cache expired and not complete", () => {
      const result: UnifiedCacheResult = {
        stages: [],
        proposalCacheExpired: false,
        timelockCacheExpired: true,
        completionStatus: "incomplete",
        isComplete: false,
        proposalResult: null,
        timelockResult: null,
      };

      expect(needsRefresh(result)).toBe(true);
    });

    it("returns false when not expired and not complete", () => {
      const result: UnifiedCacheResult = {
        stages: [],
        proposalCacheExpired: false,
        timelockCacheExpired: false,
        completionStatus: "incomplete",
        isComplete: false,
        proposalResult: null,
        timelockResult: null,
      };

      expect(needsRefresh(result)).toBe(false);
    });
  });

  describe("getRefreshNeeds", () => {
    it("returns no refresh needs when complete", () => {
      const result: UnifiedCacheResult = {
        stages: [],
        proposalCacheExpired: true,
        timelockCacheExpired: true,
        completionStatus: "completed",
        isComplete: true,
        proposalResult: null,
        timelockResult: null,
      };

      const needs = getRefreshNeeds(result);
      expect(needs.needsProposalRefresh).toBe(false);
      expect(needs.needsTimelockRefresh).toBe(false);
    });

    it("identifies proposal refresh need without timelock link", () => {
      const result: UnifiedCacheResult = {
        stages: [],
        proposalCacheExpired: true,
        timelockCacheExpired: false,
        completionStatus: "pending",
        isComplete: false,
        proposalResult: null,
        timelockResult: null,
      };

      const needs = getRefreshNeeds(result);
      expect(needs.needsProposalRefresh).toBe(true);
      expect(needs.needsTimelockRefresh).toBe(false);
    });

    it("identifies timelock refresh need with timelock link", () => {
      const timelockLink = createMockTimelockLink("0x123", "0x456");
      const result: UnifiedCacheResult = {
        stages: [],
        timelockLink,
        proposalCacheExpired: false,
        timelockCacheExpired: true,
        completionStatus: "incomplete",
        isComplete: false,
        proposalResult: {
          proposalId: "123",
          creationTxHash: "0xcreate",
          governorAddress: "0xgov",
          stages: [],
          timelockLink,
        },
        timelockResult: null,
      };

      const needs = getRefreshNeeds(result);
      expect(needs.needsProposalRefresh).toBe(false);
      expect(needs.needsTimelockRefresh).toBe(true);
    });

    it("identifies both refresh needs", () => {
      const timelockLink = createMockTimelockLink("0x123", "0x456");
      const result: UnifiedCacheResult = {
        stages: [],
        timelockLink,
        proposalCacheExpired: true,
        timelockCacheExpired: true,
        completionStatus: "incomplete",
        isComplete: false,
        proposalResult: {
          proposalId: "123",
          creationTxHash: "0xcreate",
          governorAddress: "0xgov",
          stages: [],
          timelockLink,
        },
        timelockResult: null,
      };

      const needs = getRefreshNeeds(result);
      expect(needs.needsProposalRefresh).toBe(true);
      expect(needs.needsTimelockRefresh).toBe(true);
    });
  });

  describe("loadUnifiedStages", () => {
    it("returns empty result when no cache exists", () => {
      const result = loadUnifiedStages("123", "0xgov");

      expect(result.stages).toEqual([]);
      expect(result.proposalCacheExpired).toBe(false);
      expect(result.timelockCacheExpired).toBe(false);
      expect(result.completionStatus).toBe("pending");
      expect(result.isComplete).toBe(false);
    });

    it("returns proposal stages when no timelock link", () => {
      const proposalKey = `${STORAGE_KEYS.STAGES_CACHE_PREFIX}0xgov-123`;
      const proposalCache = {
        version: CACHE_VERSION,
        timestamp: Date.now(),
        result: {
          proposalId: "123",
          creationTxHash: "0xcreate",
          governorAddress: "0xgov",
          stages: [
            createMockStage("PROPOSAL_CREATED", "COMPLETED"),
            createMockStage("VOTING_ACTIVE", "COMPLETED"),
          ],
        },
      };
      mockStorage[proposalKey] = JSON.stringify(proposalCache);

      const result = loadUnifiedStages("123", "0xgov");

      expect(result.stages).toHaveLength(2);
      expect(result.proposalResult).toEqual(proposalCache.result);
      expect(result.timelockLink).toBeUndefined();
    });

    it("merges proposal and timelock stages", () => {
      const timelockLink = createMockTimelockLink("0xtx", "0xop");
      const proposalKey = `${STORAGE_KEYS.STAGES_CACHE_PREFIX}0xgov-123`;
      const proposalCache = {
        version: CACHE_VERSION,
        timestamp: Date.now(),
        result: {
          proposalId: "123",
          creationTxHash: "0xcreate",
          governorAddress: "0xgov",
          stages: [
            createMockStage("PROPOSAL_CREATED", "COMPLETED"),
            createMockStage("VOTING_ACTIVE", "COMPLETED"),
            createMockStage("PROPOSAL_QUEUED", "COMPLETED"),
          ],
          timelockLink,
        },
      };
      mockStorage[proposalKey] = JSON.stringify(proposalCache);

      const timelockKey = getTimelockCacheKey("0xtx", "0xop");
      const timelockCache = {
        version: CACHE_VERSION,
        timestamp: Date.now(),
        result: createMockTimelockResult([
          createMockStage("L2_TIMELOCK", "COMPLETED"),
          createMockStage("L2_TO_L1_MESSAGE", "PENDING"),
        ]),
      };
      mockStorage[timelockKey] = JSON.stringify(timelockCache);

      const result = loadUnifiedStages("123", "0xgov");

      expect(result.stages).toHaveLength(5);
      expect(result.stages[0].type).toBe("PROPOSAL_CREATED");
      expect(result.stages[3].type).toBe("L2_TIMELOCK");
      expect(result.timelockLink).toEqual(timelockLink);
      expect(result.proposalResult).toBeDefined();
      expect(result.timelockResult).toBeDefined();
    });

    it("handles wrong cache version", () => {
      const proposalKey = `${STORAGE_KEYS.STAGES_CACHE_PREFIX}0xgov-123`;
      const proposalCache = {
        version: CACHE_VERSION - 1,
        timestamp: Date.now(),
        result: {
          proposalId: "123",
          creationTxHash: "0xcreate",
          governorAddress: "0xgov",
          stages: [createMockStage("PROPOSAL_CREATED", "COMPLETED")],
        },
      };
      mockStorage[proposalKey] = JSON.stringify(proposalCache);

      const result = loadUnifiedStages("123", "0xgov");

      expect(result.stages).toEqual([]);
      expect(result.proposalResult).toBeNull();
    });
  });
});
