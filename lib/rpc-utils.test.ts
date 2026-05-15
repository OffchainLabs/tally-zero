import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  batchQueryWithRateLimit,
  createRpcProvider,
  getOrCreateChunkedProvider,
  queryWithRetry,
} from "./rpc-utils";

// Mock ethers to avoid real network calls
vi.mock("ethers", () => {
  function mockProviderFactory(this: Record<string, unknown>, url: string) {
    const inner = vi.fn().mockResolvedValue([]);
    this.ready = Promise.resolve();
    this.getBlockNumber = vi.fn().mockResolvedValue(12345);
    this.getNetwork = vi.fn().mockResolvedValue({ chainId: 42161 });
    this.getLogs = inner;
    // `applyChunkedGetLogs` reassigns `provider.getLogs`. Expose the original
    // vi.fn so tests can still inspect/configure the underlying RPC calls.
    this._innerGetLogs = inner;
    this._url = url;
  }
  return {
    ethers: {
      providers: {
        JsonRpcProvider: mockProviderFactory,
        StaticJsonRpcProvider: mockProviderFactory,
      },
    },
  };
});

describe("rpc-utils", () => {
  describe("createRpcProvider", () => {
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

  describe("getOrCreateChunkedProvider", () => {
    interface ChunkableProvider {
      getLogs: (filter: unknown) => Promise<unknown[]>;
      getBlockNumber: ReturnType<typeof vi.fn>;
      _innerGetLogs: ReturnType<typeof vi.fn>;
    }

    function setup(url: string, chunkSize: number) {
      const provider = getOrCreateChunkedProvider(
        url,
        chunkSize
      ) as unknown as ChunkableProvider;
      // `applyChunkedGetLogs` replaces `provider.getLogs` with a chunking
      // wrapper that delegates to the original bound vi.fn. The mock exposes
      // that vi.fn via `_innerGetLogs` so we can assert on call args directly.
      const inner = provider._innerGetLogs;
      inner.mockReset();
      inner.mockResolvedValue([]);
      return { provider, inner };
    }

    it("splits a wide block range into chunks of `chunkSize` and aggregates", async () => {
      const { provider, inner } = setup("https://chunktest-1.example.com", 100);
      // Each chunk returns a single log so we can assert ordering by count.
      inner.mockResolvedValueOnce([{ blockNumber: 50 }]);
      inner.mockResolvedValueOnce([{ blockNumber: 150 }]);
      inner.mockResolvedValueOnce([{ blockNumber: 250 }]);
      inner.mockResolvedValueOnce([{ blockNumber: 350 }]);

      const logs = await provider.getLogs({ fromBlock: 0, toBlock: 399 });

      expect(inner).toHaveBeenCalledTimes(4);
      expect(inner.mock.calls[0][0]).toMatchObject({
        fromBlock: 0,
        toBlock: 99,
      });
      expect(inner.mock.calls[1][0]).toMatchObject({
        fromBlock: 100,
        toBlock: 199,
      });
      expect(inner.mock.calls[2][0]).toMatchObject({
        fromBlock: 200,
        toBlock: 299,
      });
      expect(inner.mock.calls[3][0]).toMatchObject({
        fromBlock: 300,
        toBlock: 399,
      });
      expect(logs).toEqual([
        { blockNumber: 50 },
        { blockNumber: 150 },
        { blockNumber: 250 },
        { blockNumber: 350 },
      ]);
    });

    it("passes ranges within chunkSize through in a single call", async () => {
      const { provider, inner } = setup(
        "https://chunktest-2.example.com",
        1000
      );
      inner.mockResolvedValueOnce([]);

      await provider.getLogs({ fromBlock: 100, toBlock: 200 });

      expect(inner).toHaveBeenCalledTimes(1);
      expect(inner.mock.calls[0][0]).toMatchObject({
        fromBlock: 100,
        toBlock: 200,
      });
    });

    it("short-circuits when `toBlock` is before `fromBlock`", async () => {
      const { provider, inner } = setup("https://chunktest-3.example.com", 100);

      const logs = await provider.getLogs({ fromBlock: 500, toBlock: 400 });

      expect(logs).toEqual([]);
      expect(inner).not.toHaveBeenCalled();
    });

    it("resolves the `latest` tag once per chunked invocation", async () => {
      const { provider, inner } = setup("https://chunktest-4.example.com", 100);
      provider.getBlockNumber.mockResolvedValue(250);
      inner.mockResolvedValue([]);

      await provider.getLogs({ fromBlock: 0, toBlock: "latest" });

      // The wrapper resolves "latest" alongside the numeric fromBlock; with
      // the recent-block cache in place each top-level call resolves "latest"
      // at most once.
      expect(provider.getBlockNumber).toHaveBeenCalledTimes(1);
      expect(inner).toHaveBeenCalledTimes(3);
      expect(inner.mock.calls[0][0]).toMatchObject({
        fromBlock: 0,
        toBlock: 99,
      });
      expect(inner.mock.calls[2][0]).toMatchObject({
        fromBlock: 200,
        toBlock: 250,
      });
    });

    it("passes blockHash-style filters straight through without chunking", async () => {
      const { provider, inner } = setup("https://chunktest-5.example.com", 100);
      inner.mockResolvedValue([]);

      await provider.getLogs({ blockHash: "0xabc" } as unknown as {
        fromBlock: number;
        toBlock: number;
      });

      expect(inner).toHaveBeenCalledTimes(1);
      expect(inner.mock.calls[0][0]).toEqual({ blockHash: "0xabc" });
    });

    it("returns the same instance for the same (url, chunkSize) tuple", () => {
      const a = getOrCreateChunkedProvider(
        "https://chunktest-6.example.com",
        100
      );
      const b = getOrCreateChunkedProvider(
        "https://chunktest-6.example.com",
        100
      );
      expect(a).toBe(b);
    });

    it("returns a different instance for a different chunkSize", () => {
      const a = getOrCreateChunkedProvider(
        "https://chunktest-7.example.com",
        100
      );
      const b = getOrCreateChunkedProvider(
        "https://chunktest-7.example.com",
        200
      );
      expect(a).not.toBe(b);
    });
  });
});
