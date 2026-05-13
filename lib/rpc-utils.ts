/**
 * RPC utilities for Ethereum provider management and query handling
 * Provides provider caching, retry logic, and batch query support with rate limiting
 */

import { debug } from "@/lib/debug";
import { delay } from "@/lib/delay-utils";
import { toError } from "@/lib/error-utils";
import { ethers } from "ethers";

/** Maximum number of cached providers before cleanup */
const MAX_PROVIDER_CACHE_SIZE = 10;

/** Cache for RPC providers, keyed by URL with last used timestamp */
interface CachedProvider {
  provider: ethers.providers.StaticJsonRpcProvider;
  lastUsed: number;
}
const providerCache = new Map<string, CachedProvider>();

/** Guard flag to prevent concurrent eviction attempts */
let isEvicting = false;

/**
 * Evicts least recently used providers when cache exceeds max size.
 * Keeps the cache bounded to prevent memory leaks.
 * Uses a guard flag to prevent race conditions from concurrent calls.
 */
function evictLruProviders(): void {
  if (isEvicting) return;
  if (providerCache.size <= MAX_PROVIDER_CACHE_SIZE) return;

  isEvicting = true;
  try {
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
      // Double-check still exists (could be deleted by concurrent cache operations)
      if (providerCache.has(url)) {
        debug.rpc("evicting LRU provider: %s", url);
        providerCache.delete(url);
      }
    }
  } finally {
    isEvicting = false;
  }
}

/**
 * Gets or creates an RPC provider without connection validation.
 * Use this for synchronous provider access (e.g., passing to gov-tracker).
 * The provider is cached but not validated - first RPC call may fail if URL is bad.
 *
 * @param rpcUrl - The JSON-RPC endpoint URL
 * @returns A cached or new JSON-RPC provider (synchronous)
 */
export function getOrCreateProvider(
  rpcUrl: string
): ethers.providers.StaticJsonRpcProvider {
  const cached = providerCache.get(rpcUrl);
  if (cached) {
    cached.lastUsed = Date.now();
    return cached.provider;
  }

  const provider = new ethers.providers.StaticJsonRpcProvider(rpcUrl);

  evictLruProviders();
  providerCache.set(rpcUrl, { provider, lastUsed: Date.now() });
  return provider;
}

/** Cache for chunked providers, keyed by `${url}|${chunkSize}` */
const chunkedProviderCache = new Map<string, CachedProvider>();

async function resolveBlockTag(
  provider: ethers.providers.StaticJsonRpcProvider,
  tag: ethers.providers.BlockTag
): Promise<number> {
  if (typeof tag === "number") return tag;
  if (typeof tag === "string") {
    if (
      tag === "latest" ||
      tag === "pending" ||
      tag === "safe" ||
      tag === "finalized"
    ) {
      return provider.getBlockNumber();
    }
    if (tag === "earliest") return 0;
    return tag.startsWith("0x") ? parseInt(tag, 16) : parseInt(tag, 10);
  }
  // BigNumber-like
  const maybeBn = tag as { toNumber?: () => number };
  if (typeof maybeBn.toNumber === "function") return maybeBn.toNumber();
  return provider.getBlockNumber();
}

/**
 * Patches a provider's getLogs to auto-chunk requests that exceed `chunkSize`.
 *
 * Some RPCs (e.g. drpc.org free tier) reject `eth_getLogs` over 10k blocks.
 * The Arbitrum SDK's EventFetcher queries L1 assertion logs without chunking,
 * which trips that limit and breaks L2_TO_L1_MESSAGE tracking. Wrapping the
 * provider intercepts those calls transparently.
 */
function applyChunkedGetLogs(
  provider: ethers.providers.StaticJsonRpcProvider,
  chunkSize: number
): ethers.providers.StaticJsonRpcProvider {
  const originalGetLogs = provider.getLogs.bind(provider);

  provider.getLogs = async function (
    filter: Parameters<ethers.providers.StaticJsonRpcProvider["getLogs"]>[0]
  ): Promise<ethers.providers.Log[]> {
    const resolved = (await filter) as ethers.providers.Filter & {
      blockHash?: string;
    };

    // FilterByBlockHash variant doesn't have a range, pass through
    if (resolved.blockHash) {
      return originalGetLogs(resolved);
    }

    const { fromBlock, toBlock } = resolved;
    if (fromBlock === undefined || fromBlock === null) {
      return originalGetLogs(resolved);
    }

    const [fromNum, toNum] = await Promise.all([
      resolveBlockTag(provider, fromBlock),
      resolveBlockTag(provider, toBlock ?? "latest"),
    ]);

    if (toNum < fromNum) return [];
    if (toNum - fromNum + 1 <= chunkSize) {
      return originalGetLogs({
        ...resolved,
        fromBlock: fromNum,
        toBlock: toNum,
      });
    }

    const logs: ethers.providers.Log[] = [];
    for (let start = fromNum; start <= toNum; start += chunkSize) {
      const end = Math.min(start + chunkSize - 1, toNum);
      const chunk = await originalGetLogs({
        ...resolved,
        fromBlock: start,
        toBlock: end,
      });
      logs.push(...chunk);
    }
    return logs;
  };

  return provider;
}

function evictLruFromCache(cache: Map<string, CachedProvider>): void {
  if (isEvicting) return;
  if (cache.size <= MAX_PROVIDER_CACHE_SIZE) return;

  isEvicting = true;
  try {
    const entries = Array.from(cache.entries()).sort(
      ([, a], [, b]) => a.lastUsed - b.lastUsed
    );
    const toEvict = entries.slice(0, cache.size - MAX_PROVIDER_CACHE_SIZE);
    for (const [key] of toEvict) {
      if (cache.has(key)) cache.delete(key);
    }
  } finally {
    isEvicting = false;
  }
}

/**
 * Gets or creates a provider whose `getLogs` auto-chunks requests by `chunkSize`.
 * Use this when passing providers to libraries (e.g. @arbitrum/sdk) that don't
 * chunk their own log queries.
 */
export function getOrCreateChunkedProvider(
  rpcUrl: string,
  chunkSize: number
): ethers.providers.StaticJsonRpcProvider {
  const key = `${rpcUrl}|${chunkSize}`;
  const cached = chunkedProviderCache.get(key);
  if (cached) {
    cached.lastUsed = Date.now();
    return cached.provider;
  }

  const provider = new ethers.providers.StaticJsonRpcProvider(rpcUrl);
  applyChunkedGetLogs(provider, chunkSize);

  evictLruFromCache(chunkedProviderCache);
  chunkedProviderCache.set(key, { provider, lastUsed: Date.now() });
  return provider;
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
): Promise<ethers.providers.StaticJsonRpcProvider> {
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
  const provider = new ethers.providers.StaticJsonRpcProvider(rpcUrl);
  await provider.ready;
  await provider.getBlockNumber(); // Verify connection works

  // Evict LRU providers if cache is full
  evictLruProviders();

  // Cache for reuse with timestamp
  providerCache.set(rpcUrl, { provider, lastUsed: Date.now() });
  return provider;
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
