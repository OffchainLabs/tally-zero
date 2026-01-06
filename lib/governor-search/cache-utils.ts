import type { ProposalCache } from "@/lib/proposal-cache";
import type { BlockRange, SearchPlan } from "./types";

/**
 * Calculate optimal search ranges using cache when available
 */
export function calculateSearchRanges(
  userStartBlock: number,
  userEndBlock: number,
  cache: ProposalCache | null,
  skipCache: boolean
): SearchPlan {
  // If no cache or skipping cache, fetch everything from RPC
  if (!cache || skipCache) {
    return {
      rpcRanges: [{ start: userStartBlock, end: userEndBlock }],
      useCache: false,
      rangeInfo: skipCache
        ? "Cache skipped, fetching all from RPC"
        : "No cache available, fetching all from RPC",
    };
  }

  const cacheStart = cache.startBlock;
  const cacheEnd = cache.snapshotBlock;

  // Case 1: User range is entirely after cache (most common - looking for new proposals)
  if (userStartBlock > cacheEnd) {
    return {
      rpcRanges: [{ start: userStartBlock, end: userEndBlock }],
      useCache: false,
      rangeInfo: `Searching new blocks ${userStartBlock.toLocaleString()}-${userEndBlock.toLocaleString()}`,
    };
  }

  // Case 2: User range is entirely within cache (full cache hit!)
  if (userStartBlock >= cacheStart && userEndBlock <= cacheEnd) {
    return {
      rpcRanges: [],
      useCache: true,
      cacheFilter: { minBlock: userStartBlock, maxBlock: userEndBlock },
      rangeInfo: `Full cache hit: blocks ${userStartBlock.toLocaleString()}-${userEndBlock.toLocaleString()}`,
    };
  }

  // Case 3: User range overlaps with cache (partial cache hit)
  const rpcRanges: BlockRange[] = [];

  if (userStartBlock < cacheStart) {
    rpcRanges.push({ start: userStartBlock, end: cacheStart - 1 });
  }

  if (userEndBlock > cacheEnd) {
    rpcRanges.push({ start: cacheEnd + 1, end: userEndBlock });
  }

  const cacheFilterMin = Math.max(userStartBlock, cacheStart);
  const cacheFilterMax = Math.min(userEndBlock, cacheEnd);

  const rangeDescriptions: string[] = [];
  if (cacheFilterMin <= cacheFilterMax) {
    rangeDescriptions.push(
      `cache: ${cacheFilterMin.toLocaleString()}-${cacheFilterMax.toLocaleString()}`
    );
  }
  for (const range of rpcRanges) {
    rangeDescriptions.push(
      `RPC: ${range.start.toLocaleString()}-${range.end.toLocaleString()}`
    );
  }

  return {
    rpcRanges,
    useCache: true,
    cacheFilter: { minBlock: cacheFilterMin, maxBlock: cacheFilterMax },
    rangeInfo: `Partial cache hit - ${rangeDescriptions.join(", ")}`,
  };
}
