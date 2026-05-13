/**
 * Tests for gov-tracker cache integration
 */

import type { TrackedStage, TrackingCheckpoint } from "@gzeoneth/gov-tracker";
import { txHashCacheKey } from "@gzeoneth/gov-tracker";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearProposalCheckpoint,
  getCacheAdapter,
  loadCachedProposal,
  seedCheckpointFromStages,
  trimCachedStages,
} from "./gov-tracker-cache";

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  const setItem = (key: string, value: string) => {
    store[key] = value;
  };

  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn(setItem),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
    key: vi.fn((index: number) => Object.keys(store)[index] ?? null),
    get length() {
      return Object.keys(store).length;
    },
    resetSetItem: () => {
      localStorageMock.setItem.mockImplementation(setItem);
    },
  };
})();

Object.defineProperty(global, "localStorage", { value: localStorageMock });

// Helper to create minimal valid stage data
const createProposalCreatedStage = (
  overrides?: Partial<TrackedStage>
): TrackedStage =>
  ({
    type: "PROPOSAL_CREATED",
    status: "COMPLETED",
    chain: "arb1",
    chainId: 42161,
    transactions: [],
    data: {
      proposer: "0xProposer",
      description: "Test proposal",
      startBlock: "1000",
      endBlock: "2000",
    },
    ...overrides,
  }) as TrackedStage;

const createVotingActiveStage = (
  overrides?: Partial<TrackedStage>
): TrackedStage =>
  ({
    type: "VOTING_ACTIVE",
    status: "COMPLETED",
    chain: "arb1",
    chainId: 42161,
    transactions: [],
    data: {
      proposalState: "Active",
      forVotes: "100",
      forVotesRaw: "100000000000000000000",
      againstVotes: "50",
      againstVotesRaw: "50000000000000000000",
      abstainVotes: "10",
      abstainVotesRaw: "10000000000000000000",
      quorum: "200",
      quorumRaw: "200000000000000000000",
      votingDeadline: 3000,
      votingDeadlineExtended: false,
    },
    ...overrides,
  }) as TrackedStage;

describe("gov-tracker-cache", () => {
  beforeEach(() => {
    localStorageMock.clear();
    localStorageMock.resetSetItem();
    vi.clearAllMocks();
  });

  afterEach(() => {
    localStorageMock.clear();
  });

  describe("getCacheAdapter", () => {
    it("returns a singleton cache adapter", () => {
      const adapter1 = getCacheAdapter();
      const adapter2 = getCacheAdapter();
      expect(adapter1).toBe(adapter2);
    });

    it("does not throw when localStorage quota is exceeded", async () => {
      const adapter = getCacheAdapter();
      localStorageMock.setItem.mockImplementation(() => {
        throw new Error(
          "Failed to execute 'setItem' on 'Storage': quota exceeded"
        );
      });

      await expect(
        adapter.set("tx:0xabc:op:0xdef", { large: "checkpoint" })
      ).resolves.toBeUndefined();
    });
  });

  describe("seedCheckpointFromStages", () => {
    it("does nothing for empty stages array", async () => {
      const cache = getCacheAdapter();
      await seedCheckpointFromStages(
        cache,
        "123",
        "0xGovernor",
        "0xTxHash",
        []
      );
      expect(localStorageMock.setItem).not.toHaveBeenCalled();
    });

    it("creates checkpoint from stages", async () => {
      const cache = getCacheAdapter();
      const stages: TrackedStage[] = [
        createProposalCreatedStage({
          transactions: [
            {
              hash: "0xTx1",
              blockNumber: 1000,
              chain: "arb1",
              chainId: 42161,
              logIndex: 0,
            },
          ],
        }),
      ];

      await seedCheckpointFromStages(
        cache,
        "123",
        "0xGovernor",
        "0xCreationTx",
        stages
      );

      expect(localStorageMock.setItem).toHaveBeenCalled();
      const storedKey = localStorageMock.setItem.mock.calls[0][0];
      const storedValue = JSON.parse(localStorageMock.setItem.mock.calls[0][1]);

      // txHashCacheKey lowercases and adds prefix
      expect(storedKey).toContain("0xcreationtx");
      expect(storedValue.input.proposalId).toBe("123");
      expect(storedValue.input.governorAddress).toBe("0xGovernor");
      expect(storedValue.cachedData.completedStages).toHaveLength(1);
    });

    it("handles stages with empty transactions array", async () => {
      const cache = getCacheAdapter();
      const stages: TrackedStage[] = [createProposalCreatedStage()];

      await seedCheckpointFromStages(
        cache,
        "123",
        "0xGovernor",
        "0xCreationTx",
        stages
      );

      expect(localStorageMock.setItem).toHaveBeenCalled();
      const storedValue = JSON.parse(localStorageMock.setItem.mock.calls[0][1]);
      expect(storedValue.lastProcessedBlock.l2).toBe(0);
    });

    it("handles stages with undefined transactions", async () => {
      const cache = getCacheAdapter();
      const stages: TrackedStage[] = [
        {
          type: "PROPOSAL_CREATED",
          status: "COMPLETED",
          chain: "arb1",
          chainId: 42161,
          transactions: [],
          data: {
            proposer: "0xProposer",
            description: "Test",
            startBlock: "1000",
            endBlock: "2000",
          },
        } as TrackedStage,
      ];

      await seedCheckpointFromStages(
        cache,
        "123",
        "0xGovernor",
        "0xCreationTx",
        stages
      );

      expect(localStorageMock.setItem).toHaveBeenCalled();
      const storedValue = JSON.parse(localStorageMock.setItem.mock.calls[0][1]);
      expect(storedValue.lastProcessedBlock.l2).toBe(0);
    });
  });

  describe("clearProposalCheckpoint", () => {
    it("removes checkpoint from cache", async () => {
      const cache = getCacheAdapter();
      await clearProposalCheckpoint(cache, "0xTxHash");
      expect(localStorageMock.removeItem).toHaveBeenCalled();
    });
  });

  describe("loadCachedProposal", () => {
    it("returns null result for missing checkpoint", async () => {
      const result = await loadCachedProposal("0xNonExistent", "0xGovernor");
      expect(result.result).toBeNull();
      expect(result.isComplete).toBe(false);
      expect(result.isExpired).toBe(false);
    });

    it("returns null result for checkpoint without stages", async () => {
      const cache = getCacheAdapter();
      const key = txHashCacheKey("0xTxHash");
      const checkpoint: TrackingCheckpoint = {
        version: 1,
        createdAt: Date.now(),
        input: {
          type: "governor",
          governorAddress: "0xGovernor",
          proposalId: "123",
          creationTxHash: "0xTxHash",
        },
        lastProcessedStage: "PROPOSAL_CREATED",
        lastProcessedBlock: { l1: 0, l2: 1000 },
        cachedData: { completedStages: [] },
        metadata: { errorCount: 0, lastTrackedAt: Date.now() },
      };
      await cache.set(key, checkpoint);

      const result = await loadCachedProposal("0xTxHash", "0xGovernor");
      expect(result.result).toBeNull();
    });

    it("returns cached proposal with stages", async () => {
      const cache = getCacheAdapter();
      const now = Date.now();
      const key = txHashCacheKey("0xTxHash");
      const checkpoint: TrackingCheckpoint = {
        version: 1,
        createdAt: now,
        input: {
          type: "governor",
          governorAddress: "0xGovernor",
          proposalId: "123",
          creationTxHash: "0xTxHash",
        },
        lastProcessedStage: "PROPOSAL_CREATED",
        lastProcessedBlock: { l1: 0, l2: 1000 },
        cachedData: {
          completedStages: [
            createProposalCreatedStage({
              transactions: [
                {
                  hash: "0xTx1",
                  blockNumber: 1000,
                  chain: "arb1",
                  chainId: 42161,
                  logIndex: 0,
                },
              ],
            }),
          ],
        },
        metadata: { errorCount: 0, lastTrackedAt: now },
      };
      await cache.set(key, checkpoint);

      const result = await loadCachedProposal("0xTxHash", "0xGovernor");
      expect(result.result).not.toBeNull();
      expect(result.result?.proposalId).toBe("123");
      expect(result.result?.stages).toHaveLength(1);
    });

    it("does not mark complete proposals as expired", async () => {
      const cache = getCacheAdapter();
      const oldTime = Date.now() - 1000 * 60 * 60 * 24; // 24 hours ago
      const key = txHashCacheKey("0xTxHash");
      const checkpoint: TrackingCheckpoint = {
        version: 1,
        createdAt: oldTime,
        input: {
          type: "governor",
          governorAddress: "0xGovernor",
          proposalId: "123",
          creationTxHash: "0xTxHash",
        },
        lastProcessedStage: "PROPOSAL_CREATED",
        lastProcessedBlock: { l1: 0, l2: 1000 },
        cachedData: {
          completedStages: [createProposalCreatedStage()],
        },
        metadata: { errorCount: 0, lastTrackedAt: oldTime },
      };
      await cache.set(key, checkpoint);

      // Even with a short TTL, complete proposals should not be expired
      const result = await loadCachedProposal(
        "0xTxHash",
        "0xGovernor",
        1000 * 60 * 60
      );
      // Complete proposals are never expired
      expect(result.isExpired).toBe(false);
    });

    it("extracts currentState from VOTING_ACTIVE stage", async () => {
      const cache = getCacheAdapter();
      const key = txHashCacheKey("0xTxHash");
      const checkpoint: TrackingCheckpoint = {
        version: 1,
        createdAt: Date.now(),
        input: {
          type: "governor",
          governorAddress: "0xGovernor",
          proposalId: "123",
          creationTxHash: "0xTxHash",
        },
        lastProcessedStage: "VOTING_ACTIVE",
        lastProcessedBlock: { l1: 0, l2: 1000 },
        cachedData: {
          completedStages: [createVotingActiveStage()],
        },
        metadata: { errorCount: 0, lastTrackedAt: Date.now() },
      };
      await cache.set(key, checkpoint);

      const result = await loadCachedProposal("0xTxHash", "0xGovernor");
      expect(result.result?.currentState).toBe("Active");
    });
  });

  describe("trimCachedStages", () => {
    it("returns false for missing checkpoint", async () => {
      const result = await trimCachedStages("0xNonExistent", 0);
      expect(result).toBe(false);
    });

    it("returns false for index beyond stages length", async () => {
      const cache = getCacheAdapter();
      const key = txHashCacheKey("0xTxHash");
      const checkpoint: TrackingCheckpoint = {
        version: 1,
        createdAt: Date.now(),
        input: {
          type: "governor",
          governorAddress: "0xGovernor",
          proposalId: "123",
          creationTxHash: "0xTxHash",
        },
        lastProcessedStage: "PROPOSAL_CREATED",
        lastProcessedBlock: { l1: 0, l2: 1000 },
        cachedData: {
          completedStages: [createProposalCreatedStage()],
        },
        metadata: { errorCount: 0, lastTrackedAt: Date.now() },
      };
      await cache.set(key, checkpoint);

      const result = await trimCachedStages("0xTxHash", 5);
      expect(result).toBe(false);
    });

    it("trims stages from specified index", async () => {
      const cache = getCacheAdapter();
      const key = txHashCacheKey("0xTxHash");
      const checkpoint: TrackingCheckpoint = {
        version: 1,
        createdAt: Date.now(),
        input: {
          type: "governor",
          governorAddress: "0xGovernor",
          proposalId: "123",
          creationTxHash: "0xTxHash",
        },
        lastProcessedStage: "VOTING_ACTIVE",
        lastProcessedBlock: { l1: 0, l2: 2000 },
        cachedData: {
          completedStages: [
            createProposalCreatedStage(),
            createVotingActiveStage(),
            {
              type: "PROPOSAL_QUEUED",
              status: "COMPLETED",
              chain: "arb1",
              chainId: 42161,
              transactions: [],
              data: { proposalState: "Queued" },
            } as TrackedStage,
          ],
        },
        metadata: { errorCount: 0, lastTrackedAt: Date.now() },
      };
      await cache.set(key, checkpoint);

      const result = await trimCachedStages("0xTxHash", 1);
      expect(result).toBe(true);

      // Verify the trimmed checkpoint
      const trimmedCheckpoint = await cache.get<TrackingCheckpoint>(key);
      expect(trimmedCheckpoint?.cachedData?.completedStages).toHaveLength(1);
      expect(trimmedCheckpoint?.lastProcessedStage).toBe("PROPOSAL_CREATED");
    });
  });
});
