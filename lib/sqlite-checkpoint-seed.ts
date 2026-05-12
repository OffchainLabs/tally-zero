import { txHashCacheKey, type CacheAdapter } from "@gzeoneth/gov-tracker";

import { debug } from "@/lib/debug";
import { getTallyDataClient } from "@/lib/tally-data/client";

const inFlight = new Map<string, Promise<void>>();

export async function seedProposalCheckpointFromSqlite(
  cache: CacheAdapter,
  creationTxHash: string
): Promise<void> {
  if (!creationTxHash) return;

  const key = txHashCacheKey(creationTxHash);

  const existing = inFlight.get(key);
  if (existing) return existing;

  const promise = (async () => {
    if (await cache.has(key)) return;

    const checkpoint =
      await getTallyDataClient().getProposalCheckpoint(creationTxHash);
    if (!checkpoint) return;

    if (await cache.has(key)) return;
    await cache.set(key, checkpoint);
    debug.cache(
      "seeded gov-tracker cache from SQLite for %s",
      creationTxHash.slice(0, 10)
    );
  })().finally(() => {
    inFlight.delete(key);
  });

  inFlight.set(key, promise);
  return promise;
}
