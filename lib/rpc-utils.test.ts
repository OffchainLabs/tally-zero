import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_MAX_BLOCK_RANGE,
  batchQueryWithRateLimit,
  clearProviderCache,
  createRpcProvider,
  queryWithRetry,
} from "./rpc-utils";

// Mock ethers to avoid real network calls
vi.mock("ethers", () => {
  const mockProviderFactory = (url: string) => ({
    ready: Promise.resolve(),
    getBlockNumber: vi.fn().mockResolvedValue(12345),
    getNetwork: vi.fn().mockResolvedValue({ chainId: 42161 }),
    _url: url,
  });
  return {
    ethers: {
      providers: {
        JsonRpcProvider: vi.fn().mockImplementation(mockProviderFactory),
        StaticJsonRpcProvider: vi.fn().mockImplementation(mockProviderFactory),
      },
    },
  };
});

describe("rpc-utils", () => {
  describe("DEFAULT_MAX_BLOCK_RANGE", () => {
    it("is 10M", () => {
      expect(DEFAULT_MAX_BLOCK_RANGE).toBe(10_000_000);
    });
  });

  describe("createRpcProvider", () => {
    beforeEach(() => {
      clearProviderCache();
    });

    it("creates a new provider for a URL", async () => {
      const provider = await createRpcProvider("https://rpc.example.com");
      expect(provider).toBeDefined();
    });

    it("returns cached provider for same URL", async () => {
      const provider1 = await createRpcProvider("https://rpc.example.com");
      const provider2 = await createRpcProvider("https://rpc.example.com");
      expect(provider1).toBe(provider2);
    });

    it("creates different providers for different URLs", async () => {
      const provider1 = await createRpcProvider("https://rpc1.example.com");
      const provider2 = await createRpcProvider("https://rpc2.example.com");
      expect(provider1).not.toBe(provider2);
    });
  });

  describe("clearProviderCache", () => {
    beforeEach(() => {
      clearProviderCache();
    });

    it("clears a specific provider from cache", async () => {
      const url = "https://rpc.example.com";
      const provider1 = await createRpcProvider(url);
      clearProviderCache(url);
      const provider2 = await createRpcProvider(url);
      expect(provider1).not.toBe(provider2);
    });

    it("clears all providers when no URL provided", async () => {
      const provider1 = await createRpcProvider("https://rpc1.example.com");
      const provider2 = await createRpcProvider("https://rpc2.example.com");
      clearProviderCache();
      const provider3 = await createRpcProvider("https://rpc1.example.com");
      const provider4 = await createRpcProvider("https://rpc2.example.com");
      expect(provider1).not.toBe(provider3);
      expect(provider2).not.toBe(provider4);
    });
  });

  describe("queryWithRetry", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("returns result on first success", async () => {
      const queryFn = vi.fn().mockResolvedValue("success");

      const resultPromise = queryWithRetry(queryFn);
      const result = await resultPromise;

      expect(result).toBe("success");
      expect(queryFn).toHaveBeenCalledTimes(1);
    });

    it("retries on failure and succeeds", async () => {
      const queryFn = vi
        .fn()
        .mockRejectedValueOnce(new Error("fail 1"))
        .mockRejectedValueOnce(new Error("fail 2"))
        .mockResolvedValue("success");

      const resultPromise = queryWithRetry(queryFn, {
        maxRetries: 3,
        initialDelay: 100,
      });

      await vi.advanceTimersByTimeAsync(100);
      await vi.advanceTimersByTimeAsync(200);

      const result = await resultPromise;

      expect(result).toBe("success");
      expect(queryFn).toHaveBeenCalledTimes(3);
    });

    it("throws after max retries", async () => {
      const queryFn = vi.fn().mockRejectedValue(new Error("always fails"));

      let caughtError: unknown = null;
      const resultPromise = queryWithRetry(queryFn, {
        maxRetries: 2,
        initialDelay: 100,
      }).catch((e) => {
        caughtError = e;
      });

      await vi.runAllTimersAsync();
      await resultPromise;

      expect(caughtError).toBeInstanceOf(Error);
      expect((caughtError as Error).message).toBe("always fails");
      expect(queryFn).toHaveBeenCalledTimes(3);
    });

    it("applies exponential backoff", async () => {
      const queryFn = vi
        .fn()
        .mockRejectedValueOnce(new Error("fail"))
        .mockRejectedValueOnce(new Error("fail"))
        .mockResolvedValue("success");

      const resultPromise = queryWithRetry(queryFn, {
        maxRetries: 3,
        initialDelay: 1000,
        backoffFactor: 2,
      });

      await vi.advanceTimersByTimeAsync(1000);
      expect(queryFn).toHaveBeenCalledTimes(2);

      await vi.advanceTimersByTimeAsync(2000);
      expect(queryFn).toHaveBeenCalledTimes(3);

      await resultPromise;
    });

    it("respects maxDelay cap", async () => {
      const queryFn = vi
        .fn()
        .mockRejectedValueOnce(new Error("fail"))
        .mockRejectedValueOnce(new Error("fail"))
        .mockRejectedValueOnce(new Error("fail"))
        .mockResolvedValue("success");

      const resultPromise = queryWithRetry(queryFn, {
        maxRetries: 4,
        initialDelay: 1000,
        backoffFactor: 10,
        maxDelay: 5000,
      });

      await vi.advanceTimersByTimeAsync(1000);
      await vi.advanceTimersByTimeAsync(5000);
      await vi.advanceTimersByTimeAsync(5000);

      const result = await resultPromise;
      expect(result).toBe("success");
    });

    it("handles rate limit errors", async () => {
      const rateLimitError = { code: 429, message: "rate limit exceeded" };
      const queryFn = vi
        .fn()
        .mockRejectedValueOnce(rateLimitError)
        .mockResolvedValue("success");

      const resultPromise = queryWithRetry(queryFn, {
        maxRetries: 2,
        initialDelay: 100,
      });

      await vi.advanceTimersByTimeAsync(100);

      const result = await resultPromise;
      expect(result).toBe("success");
      // Rate limit handling is logged via debug module (not console.warn)
    });

    it("handles non-Error rejections", async () => {
      const queryFn = vi
        .fn()
        .mockRejectedValueOnce("string error")
        .mockResolvedValue("success");

      const resultPromise = queryWithRetry(queryFn, {
        maxRetries: 1,
        initialDelay: 100,
      });

      await vi.advanceTimersByTimeAsync(100);

      const result = await resultPromise;
      expect(result).toBe("success");
    });
  });

  describe("batchQueryWithRateLimit", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("processes queries in batches", async () => {
      const queries = [
        vi.fn().mockResolvedValue(1),
        vi.fn().mockResolvedValue(2),
        vi.fn().mockResolvedValue(3),
        vi.fn().mockResolvedValue(4),
        vi.fn().mockResolvedValue(5),
      ];

      const resultPromise = batchQueryWithRateLimit(queries, 2, 100);

      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(100);
      await vi.advanceTimersByTimeAsync(100);

      const results = await resultPromise;

      expect(results).toEqual([1, 2, 3, 4, 5]);
    });

    it("adds delay between batches", async () => {
      const startTime = Date.now();
      const queries = [
        vi.fn().mockResolvedValue(1),
        vi.fn().mockResolvedValue(2),
        vi.fn().mockResolvedValue(3),
      ];

      const resultPromise = batchQueryWithRateLimit(queries, 1, 1000);

      await vi.advanceTimersByTimeAsync(1000);
      await vi.advanceTimersByTimeAsync(1000);

      await resultPromise;

      expect(Date.now() - startTime).toBeGreaterThanOrEqual(2000);
    });

    it("returns all results in order", async () => {
      const queries = [
        vi.fn().mockResolvedValue("a"),
        vi.fn().mockResolvedValue("b"),
        vi.fn().mockResolvedValue("c"),
      ];

      const resultPromise = batchQueryWithRateLimit(queries, 5, 0);
      const results = await resultPromise;

      expect(results).toEqual(["a", "b", "c"]);
    });

    it("handles empty query array", async () => {
      const results = await batchQueryWithRateLimit([], 5, 100);
      expect(results).toEqual([]);
    });

    it("handles single query", async () => {
      const query = vi.fn().mockResolvedValue("only one");
      const results = await batchQueryWithRateLimit([query], 5, 100);

      expect(results).toEqual(["only one"]);
      expect(query).toHaveBeenCalledTimes(1);
    });

    it("uses default batch size of 5", async () => {
      const queries = Array(6)
        .fill(null)
        .map((_, i) => vi.fn().mockResolvedValue(i));

      const resultPromise = batchQueryWithRateLimit(queries);

      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(1000);

      const results = await resultPromise;
      expect(results).toEqual([0, 1, 2, 3, 4, 5]);
    });
  });
});
