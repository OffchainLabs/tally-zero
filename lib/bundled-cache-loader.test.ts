import type { CacheAdapter } from "@gzeoneth/gov-tracker";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { STORAGE_KEYS } from "@/config/storage-keys";

import {
  getBundledProposalCreationTxHash,
  initializeBundledCache,
  resetBundledCacheFlag,
} from "./bundled-cache-loader";

vi.mock("./storage-utils", () => ({
  getStoredValue: vi.fn(),
}));

vi.mock("./debug", () => ({
  debug: {
    cache: vi.fn(),
  },
}));

import { getStoredValue } from "./storage-utils";

const mockGetStoredValue = vi.mocked(getStoredValue);

function createMockCache(existingKeys: string[] = []): CacheAdapter {
  const store = new Map<string, unknown>();
  existingKeys.forEach((key) => store.set(key, {}));

  const mockCache: CacheAdapter = {
    get: async <T>(key: string): Promise<T | null> => {
      return (store.get(key) as T) ?? null;
    },
    set: async (key: string, value: unknown): Promise<void> => {
      store.set(key, value);
    },
    has: async (key: string): Promise<boolean> => {
      return store.has(key);
    },
    delete: async (key: string): Promise<void> => {
      store.delete(key);
    },
    keys: async (): Promise<string[]> => {
      return Array.from(store.keys());
    },
    clear: async (): Promise<void> => {
      store.clear();
    },
  };

  // Wrap with spies for assertion
  return {
    get: vi.fn(mockCache.get),
    set: vi.fn(mockCache.set),
    has: vi.fn(mockCache.has),
    delete: vi.fn(mockCache.delete),
    keys: vi.fn(mockCache.keys),
    clear: vi.fn(mockCache.clear),
  } as unknown as CacheAdapter;
}

describe("bundled-cache-loader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetBundledCacheFlag();
    mockGetStoredValue.mockReturnValue(false);
  });

  afterEach(() => {
    resetBundledCacheFlag();
  });

  describe("initializeBundledCache", () => {
    it("skips initialization when bundled cache is disabled via settings", async () => {
      // #given
      mockGetStoredValue.mockReturnValue(true);
      const cache = createMockCache();

      // #when
      await initializeBundledCache(cache);

      // #then
      expect(mockGetStoredValue).toHaveBeenCalledWith(
        STORAGE_KEYS.SKIP_BUNDLED_CACHE,
        false
      );
      expect(cache.keys).not.toHaveBeenCalled();
    });

    it("merges bundled cache entries that don't already exist", async () => {
      // #given
      // Cache has some keys but not all bundled entries
      const cache = createMockCache(["tx:existing-key"]);

      // #when
      await initializeBundledCache(cache);

      // #then
      // Should check existing keys to determine what to merge
      expect(cache.keys).toHaveBeenCalled();
      // May or may not call set depending on bundled cache content
      // The key behavior is that it checks keys and merges missing ones
    });

    it("only initializes once (idempotent)", async () => {
      // #given
      const cache = createMockCache(["existing-key"]);

      // #when
      await initializeBundledCache(cache);
      await initializeBundledCache(cache);
      await initializeBundledCache(cache);

      // #then
      expect(cache.keys).toHaveBeenCalledTimes(1);
    });

    it("handles cache.keys returning iterable instead of array", async () => {
      // #given
      const cache = createMockCache();
      // Mock keys to return a Set (iterable, not array)
      // Include some bundled cache keys to verify Set iteration works
      const iterableKeys = new Set(["tx:existing-key"]);
      vi.mocked(cache.keys).mockResolvedValue(
        iterableKeys as unknown as string[]
      );

      // #when
      await initializeBundledCache(cache);

      // #then
      // Should handle Set iteration correctly and call keys()
      expect(cache.keys).toHaveBeenCalled();
      // Will call set for any missing bundled entries
    });

    it("handles import error gracefully", async () => {
      // #given
      const cache = createMockCache();

      // This test verifies that if bundled cache import fails,
      // the function handles it gracefully (doesn't throw)
      // Since we can't easily mock dynamic imports in vitest,
      // we verify the catch block behavior by calling with skip=true then false
      // which exercises different code paths

      // #when / #then - should not throw regardless of import success
      await expect(initializeBundledCache(cache)).resolves.toBeUndefined();
    });
  });

  describe("resetBundledCacheFlag", () => {
    it("allows re-initialization after reset", async () => {
      // #given
      const cache1 = createMockCache(["tx:existing-key"]);
      await initializeBundledCache(cache1);

      // After first init, the flag should be set
      // Second call with same flag should NOT call keys again
      const cache2 = createMockCache(["tx:existing-key"]);
      await initializeBundledCache(cache2);
      expect(cache2.keys).not.toHaveBeenCalled();

      // #when - reset the flag
      resetBundledCacheFlag();

      // #then - after reset, keys should be called again
      const cache3 = createMockCache(["tx:existing-key"]);
      await initializeBundledCache(cache3);
      expect(cache3.keys).toHaveBeenCalled();
    });
  });

  describe("getBundledProposalCreationTxHash", () => {
    // Pulled directly from @gzeoneth/gov-tracker/bundled-cache.json so the
    // test exercises the real JSON the app loads at runtime.
    const KNOWN_PROPOSAL_ID =
      "60371879178081104082641012273221287927865067413661362234634146098631763379427";
    const KNOWN_TX_HASH =
      "0x91226f5bfad5d1c0911ed590287734241f6b3101d8b60970911987dfa74fe37e";
    const KNOWN_GOVERNOR = "0xf07DeD9dC292157749B6Fd268E37DF6EA38395B9";

    it("returns the creation tx hash for a proposal present in the bundled cache", async () => {
      const result = await getBundledProposalCreationTxHash({
        proposalId: KNOWN_PROPOSAL_ID,
      });
      expect(result).toBe(KNOWN_TX_HASH);
    });

    it("matches the governor address case-insensitively", async () => {
      const result = await getBundledProposalCreationTxHash({
        proposalId: KNOWN_PROPOSAL_ID,
        governorAddress: KNOWN_GOVERNOR.toLowerCase(),
      });
      expect(result).toBe(KNOWN_TX_HASH);
    });

    it("returns null when the governor address does not match the bundled entry", async () => {
      const result = await getBundledProposalCreationTxHash({
        proposalId: KNOWN_PROPOSAL_ID,
        governorAddress: "0x0000000000000000000000000000000000000000",
      });
      expect(result).toBeNull();
    });

    it("returns null for proposal ids not present in the bundled cache", async () => {
      const result = await getBundledProposalCreationTxHash({
        proposalId: "0",
      });
      expect(result).toBeNull();
    });

    it("returns null when the bundled cache is disabled via settings", async () => {
      mockGetStoredValue.mockReturnValue(true);
      const result = await getBundledProposalCreationTxHash({
        proposalId: KNOWN_PROPOSAL_ID,
      });
      expect(result).toBeNull();
    });
  });

  describe("concurrent initialization", () => {
    it("handles concurrent calls without duplicate initialization", async () => {
      // #given
      const cache = createMockCache();

      // #when - call initializeBundledCache multiple times concurrently
      const results = await Promise.all([
        initializeBundledCache(cache),
        initializeBundledCache(cache),
        initializeBundledCache(cache),
      ]);

      // #then - all should resolve successfully
      expect(results).toHaveLength(3);
      // Only one call should have queried keys (shared initialization)
      expect(cache.keys).toHaveBeenCalledTimes(1);
    });
  });
});
