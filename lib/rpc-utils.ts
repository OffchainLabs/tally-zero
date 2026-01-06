/**
 * RPC utilities for Ethereum provider management and query handling
 * Provides provider caching, retry logic, and batch query support with rate limiting
 */

import { debug } from "@/lib/debug";
import { delay } from "@/lib/delay-utils";
import { toError } from "@/lib/error-utils";
import { ethers } from "ethers";

/** Default maximum block range for RPC queries */
export const DEFAULT_MAX_BLOCK_RANGE = 10_000_000;

/** Maximum number of cached providers before cleanup */
const MAX_PROVIDER_CACHE_SIZE = 10;

/** Cache for RPC providers, keyed by URL with last used timestamp */
interface CachedProvider {
  provider: ethers.providers.JsonRpcProvider;
  lastUsed: number;
}
const providerCache = new Map<string, CachedProvider>();

/**
 * Evicts least recently used providers when cache exceeds max size.
 * Keeps the cache bounded to prevent memory leaks.
 */
function evictLruProviders(): void {
  if (providerCache.size <= MAX_PROVIDER_CACHE_SIZE) return;

  // Sort entries by lastUsed timestamp (oldest first)
  const entries = Array.from(providerCache.entries()).sort(
    ([, a], [, b]) => a.lastUsed - b.lastUsed
  );

  // Evict oldest entries until we're under the limit
  const toEvict = entries.slice(
    0,
    providerCache.size - MAX_PROVIDER_CACHE_SIZE
  );
  for (const [url] of toEvict) {
    debug.rpc("evicting LRU provider: %s", url);
    providerCache.delete(url);
  }
}

/**
 * Creates and initializes an RPC provider with ready state validation.
 * Caches providers by URL to avoid creating multiple instances.
 * Validates connection by fetching the current block number.
 * @param rpcUrl - The JSON-RPC endpoint URL
 * @returns An initialized and connected JSON-RPC provider
 */
export async function createRpcProvider(
  rpcUrl: string
): Promise<ethers.providers.JsonRpcProvider> {
  // Return cached provider if available and still connected
  const cached = providerCache.get(rpcUrl);
  if (cached) {
    try {
      // Quick check that provider is still working
      await cached.provider.getNetwork();
      // Update last used timestamp
      cached.lastUsed = Date.now();
      return cached.provider;
    } catch {
      // Provider disconnected, remove from cache
      debug.rpc("cached provider disconnected, removing: %s", rpcUrl);
      providerCache.delete(rpcUrl);
    }
  }

  // Create new provider
  const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
  await provider.ready;
  await provider.getBlockNumber(); // Verify connection works

  // Evict LRU providers if cache is full
  evictLruProviders();

  // Cache for reuse with timestamp
  providerCache.set(rpcUrl, { provider, lastUsed: Date.now() });
  return provider;
}

/**
 * Clears providers from the cache.
 * Useful when switching RPCs or handling connection errors.
 * @param rpcUrl - Optional URL to clear. If omitted, clears entire cache.
 */
export function clearProviderCache(rpcUrl?: string): void {
  if (rpcUrl) {
    providerCache.delete(rpcUrl);
  } else {
    providerCache.clear();
  }
}

/** Configuration options for query retry behavior */
export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Initial delay in ms before first retry (default: 1000) */
  initialDelay?: number;
  /** Maximum delay in ms between retries (default: 16000) */
  maxDelay?: number;
  /** Multiplier for exponential backoff (default: 2) */
  backoffFactor?: number;
  /** Delay in ms between sequential queries (default: 2000) */
  rateLimitDelay?: number;
}

/** Default retry options for RPC queries */
const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxRetries: 3,
  initialDelay: 1000,
  maxDelay: 16000,
  backoffFactor: 2,
  rateLimitDelay: 2000,
};

/**
 * Execute an async query with exponential backoff retry logic.
 * Handles rate limit errors (429) and implements automatic retry with increasing delays.
 * @param queryFn - The async function to execute
 * @param options - Retry configuration options
 * @returns The result of the query function
 * @throws The last error if all retries are exhausted
 */
export async function queryWithRetry<T>(
  queryFn: () => Promise<T>,
  options: RetryOptions = DEFAULT_RETRY_OPTIONS
): Promise<T> {
  let lastError: Error = new Error("All retry attempts failed");
  let retryDelay = options.initialDelay || 1000;

  for (let attempt = 0; attempt <= (options.maxRetries || 3); attempt++) {
    try {
      return await queryFn();
    } catch (error) {
      lastError = toError(error);

      // Check if it's a rate limit error
      const errorObj = error as { code?: number; message?: string };
      if (
        errorObj.code === 429 ||
        errorObj.message?.includes("rate limit") ||
        errorObj.message?.includes("too many requests")
      ) {
        debug.rpc(
          "rate limit hit, attempt %d/%d",
          attempt + 1,
          (options.maxRetries || 3) + 1
        );
      }

      if (attempt < (options.maxRetries || 3)) {
        debug.rpc("retry attempt %d after %dms", attempt + 1, retryDelay);
        await delay(retryDelay);
        retryDelay = Math.min(
          retryDelay * (options.backoffFactor || 2),
          options.maxDelay || 16000
        );
      }
    }
  }

  throw lastError;
}

/**
 * Execute multiple queries in batches with rate limiting.
 * Prevents overwhelming RPC endpoints by processing queries in chunks
 * with delays between batches.
 * @param queries - Array of async query functions to execute
 * @param batchSize - Number of concurrent queries per batch (default: 5)
 * @param delayBetweenBatches - Delay in ms between batches (default: 1000)
 * @returns Array of results in the same order as input queries
 */
export async function batchQueryWithRateLimit<T>(
  queries: (() => Promise<T>)[],
  batchSize: number = 5,
  delayBetweenBatches: number = 1000
): Promise<T[]> {
  const results: T[] = [];

  for (let i = 0; i < queries.length; i += batchSize) {
    const batch = queries.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map((query) => queryWithRetry(query))
    );
    results.push(...batchResults);

    // Add delay between batches to avoid rate limits
    if (i + batchSize < queries.length) {
      await delay(delayBetweenBatches);
    }
  }

  return results;
}
