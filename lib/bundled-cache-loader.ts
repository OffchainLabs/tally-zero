import {
  getStageData,
  getVotingDataFromStages,
  extractOperationIds as govExtractOperationIds,
  extractProposals as govExtractProposals,
  extractTimelockOps as govExtractTimelockOps,
  getWatermarksFromCache as govGetWatermarksFromCache,
  type BundledCache,
  type CacheAdapter,
  type DiscoveryWatermarks,
  type LoadedWatermarks,
  type TrackedStage,
  type TrackingCheckpoint,
} from "@gzeoneth/gov-tracker";

import {
  BUNDLED_CACHE_BATCH_SIZE,
  BUNDLED_CACHE_MAX_RETRIES,
  BUNDLED_CACHE_RETRY_DELAY_MS,
  CACHE_VERSION,
  STORAGE_KEYS,
} from "@/config/storage-keys";
import { findByAddress } from "@/lib/address-utils";
import type { ParsedProposal, ProposalStateName } from "@/types/proposal";
import {
  ARBITRUM_CHAIN_ID,
  ARBITRUM_GOVERNORS,
} from "@config/arbitrum-governance";

import { debug } from "./debug";
import { getStoredValue, setStoredValue } from "./storage-utils";

let bundledCacheInitialized = false;
let bundledCacheInitPromise: Promise<void> | null = null;
let bundledCacheData: BundledCache | null = null;

async function withRetry<T>(
  fn: () => Promise<T>,
  retries = BUNDLED_CACHE_MAX_RETRIES
): Promise<T> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === retries) throw err;
      await new Promise((r) =>
        setTimeout(r, BUNDLED_CACHE_RETRY_DELAY_MS * attempt)
      );
    }
  }
  throw new Error("Unreachable");
}

async function loadBundledCache(): Promise<BundledCache> {
  if (bundledCacheData) return bundledCacheData;

  const imported = await import("@gzeoneth/gov-tracker/bundled-cache.json");
  bundledCacheData = imported.default as BundledCache;
  return bundledCacheData;
}

export async function initializeBundledCache(
  cache: CacheAdapter
): Promise<void> {
  if (bundledCacheInitialized) {
    return;
  }

  if (bundledCacheInitPromise) {
    return bundledCacheInitPromise;
  }

  bundledCacheInitPromise = doInitializeBundledCache(cache).catch((err) => {
    bundledCacheInitPromise = null;
    throw err;
  });
  return bundledCacheInitPromise;
}

async function doInitializeBundledCache(cache: CacheAdapter): Promise<void> {
  const skipBundledCache = getStoredValue<boolean>(
    STORAGE_KEYS.SKIP_BUNDLED_CACHE,
    false
  );
  if (skipBundledCache) {
    debug.cache("bundled cache disabled via settings");
    bundledCacheInitialized = true;
    return;
  }

  try {
    const bundledCache = await loadBundledCache();
    const entries = Object.entries(bundledCache);

    const storedVersion = getStoredValue<number>(
      STORAGE_KEYS.LAST_CACHE_VERSION,
      0
    );
    const versionMismatch = storedVersion !== CACHE_VERSION;

    if (versionMismatch) {
      debug.cache(
        "cache version mismatch (stored: %d, current: %d), clearing stale data",
        storedVersion,
        CACHE_VERSION
      );
      await cache.clear();
    }

    const existingKeys = new Set(await cache.keys());
    const newEntries = entries.filter(([key]) => !existingKeys.has(key));

    if (newEntries.length === 0) {
      debug.cache(
        "cache already has all %d bundled checkpoints",
        entries.length
      );
      if (versionMismatch) {
        setStoredValue(STORAGE_KEYS.LAST_CACHE_VERSION, CACHE_VERSION);
      }
      bundledCacheInitialized = true;
      return;
    }

    debug.cache(
      "loading %d bundled checkpoints (existing: %d)",
      newEntries.length,
      existingKeys.size
    );

    for (let i = 0; i < newEntries.length; i += BUNDLED_CACHE_BATCH_SIZE) {
      const batch = newEntries.slice(i, i + BUNDLED_CACHE_BATCH_SIZE);
      await withRetry(() =>
        Promise.all(
          batch.map(([key, checkpoint]) => cache.set(key, checkpoint))
        )
      );
    }

    setStoredValue(STORAGE_KEYS.LAST_CACHE_VERSION, CACHE_VERSION);
    debug.cache(
      "loaded %d bundled checkpoints (total: %d)",
      newEntries.length,
      existingKeys.size + newEntries.length
    );
    bundledCacheInitialized = true;
  } catch (err) {
    debug.cache(
      "bundled cache not available (expected in static builds): %O",
      err
    );
    bundledCacheInitialized = true;
  }
}

export function resetBundledCacheFlag(): void {
  bundledCacheInitialized = false;
  bundledCacheInitPromise = null;
  bundledCacheData = null;
}

/**
 * Get discovery watermarks from bundled cache
 * Uses gov-tracker's getWatermarksFromCache utility and wraps for compatibility
 */
export async function getBundledCacheWatermarks(): Promise<LoadedWatermarks | null> {
  const skipBundledCache = getStoredValue<boolean>(
    STORAGE_KEYS.SKIP_BUNDLED_CACHE,
    false
  );
  if (skipBundledCache) {
    return null;
  }

  try {
    const cache = await loadBundledCache();
    const watermarks: DiscoveryWatermarks | null =
      govGetWatermarksFromCache(cache);

    if (!watermarks) {
      return null;
    }

    // Wrap raw watermarks in LoadedWatermarks format for compatibility
    // gov-tracker's getWatermarksFromCache returns DiscoveryWatermarks directly,
    // but TallyZero expects LoadedWatermarks { watermarks, hashes }
    const checkpoint = cache["discovery:watermarks"] as
      | TrackingCheckpoint
      | undefined;
    return {
      watermarks,
      hashes: checkpoint?.cachedData?.watermarkHashes ?? {},
    };
  } catch {
    return null;
  }
}

/**
 * Map proposal state from gov-tracker format to TallyZero format
 */
function mapProposalState(
  state: string | number | undefined
): ProposalStateName {
  if (state === undefined || state === null) return "Pending";

  // Handle numeric state values (OpenZeppelin Governor state enum)
  if (typeof state === "number") {
    const stateMap: Record<number, ProposalStateName> = {
      0: "Pending",
      1: "Active",
      2: "Canceled",
      3: "Defeated",
      4: "Succeeded",
      5: "Queued",
      6: "Expired",
      7: "Executed",
    };
    return stateMap[state] ?? "Pending";
  }

  const normalized = state.toLowerCase();
  const validStates: ProposalStateName[] = [
    "Pending",
    "Active",
    "Canceled",
    "Defeated",
    "Succeeded",
    "Queued",
    "Expired",
    "Executed",
  ];
  const match = validStates.find((s) => s.toLowerCase() === normalized);
  return match ?? "Pending";
}

/**
 * Extract full proposal data from bundled cache
 * Uses gov-tracker's extractProposals utility and maps to TallyZero's ParsedProposal format
 */
export async function extractProposalsFromBundledCache(): Promise<{
  proposals: ParsedProposal[];
  activeProposalIds: Set<string>;
}> {
  const proposals: ParsedProposal[] = [];
  const activeProposalIds = new Set<string>();

  const skipBundledCache = getStoredValue<boolean>(
    STORAGE_KEYS.SKIP_BUNDLED_CACHE,
    false
  );
  if (skipBundledCache) {
    debug.cache("skipping bundled cache extraction (disabled via settings)");
    return { proposals, activeProposalIds };
  }

  try {
    const cache = await loadBundledCache();
    const extracted = govExtractProposals(cache);

    for (const proposal of extracted) {
      const governor = findByAddress(
        ARBITRUM_GOVERNORS,
        proposal.governorAddress
      );

      // Extract state from currentState field or infer from stages
      const state = mapProposalState(proposal.currentState);

      if (state === "Pending" || state === "Active") {
        activeProposalIds.add(proposal.proposalId);
      }

      // Get proposal creation data from PROPOSAL_CREATED stage
      const createdStage = proposal.stages.find(
        (s) => s.type === "PROPOSAL_CREATED"
      );
      const createdData = createdStage
        ? getStageData(createdStage, "PROPOSAL_CREATED")
        : null;

      // Get vote data from VOTING_ACTIVE stage
      const voteData = getVotingDataFromStages(proposal.stages);

      proposals.push({
        id: proposal.proposalId,
        contractAddress: proposal.governorAddress as `0x${string}`,
        proposer: createdData?.proposer ?? "",
        targets: createdData?.targets ?? [],
        values: createdData?.values ?? [],
        signatures: createdData?.signatures ?? [],
        calldatas: createdData?.calldatas ?? [],
        startBlock: createdData?.startBlock ?? "0",
        endBlock: createdData?.endBlock ?? "0",
        description: createdData?.description ?? "",
        networkId: String(ARBITRUM_CHAIN_ID),
        state,
        governorName: governor?.name ?? "Unknown",
        creationTxHash: proposal.creationTxHash ?? "",
        votes: voteData
          ? {
              forVotes: voteData.forVotesRaw ?? "0",
              againstVotes: voteData.againstVotesRaw ?? "0",
              abstainVotes: voteData.abstainVotesRaw ?? "0",
              quorum: voteData.quorumRaw ?? undefined,
            }
          : undefined,
      });
    }

    debug.cache(
      "extracted %d proposals from bundled cache (%d active)",
      proposals.length,
      activeProposalIds.size
    );
    return { proposals, activeProposalIds };
  } catch {
    return { proposals: [], activeProposalIds: new Set() };
  }
}

/**
 * Extract operation IDs from governor proposals in bundled cache
 * Uses gov-tracker's extractOperationIds and converts Map to Set
 */
export async function extractOperationIdsFromBundledCache(): Promise<
  Set<string>
> {
  const skipBundledCache = getStoredValue<boolean>(
    STORAGE_KEYS.SKIP_BUNDLED_CACHE,
    false
  );
  if (skipBundledCache) {
    return new Set();
  }

  try {
    const cache = await loadBundledCache();
    const opIdMap = govExtractOperationIds(cache);

    // Convert Map<proposalId, operationId> to Set<operationId>
    const operationIds = new Set<string>();
    for (const opId of opIdMap.values()) {
      operationIds.add(opId.toLowerCase());
    }

    debug.cache(
      "extracted %d operation IDs from bundled cache",
      operationIds.size
    );
    return operationIds;
  } catch {
    return new Set();
  }
}

/** Timelock operation extracted from bundled cache */
export interface BundledTimelockOp {
  operationId: string;
  timelockAddress: string;
  scheduledTxHash: string;
  queueBlock: number;
  stages: TrackedStage[];
}

/**
 * Extract timelock operations from bundled cache
 * Uses gov-tracker's extractTimelockOps utility
 */
export async function extractTimelockOpsFromBundledCache(): Promise<
  BundledTimelockOp[]
> {
  const skipBundledCache = getStoredValue<boolean>(
    STORAGE_KEYS.SKIP_BUNDLED_CACHE,
    false
  );
  if (skipBundledCache) {
    return [];
  }

  try {
    const cache = await loadBundledCache();
    const extracted = govExtractTimelockOps(cache);

    const ops: BundledTimelockOp[] = extracted.map((op) => {
      // Get queue block from the first transaction in the first stage
      const firstStage = op.stages[0];
      const firstTx = firstStage?.transactions?.[0];
      const queueBlock = firstTx?.blockNumber ?? 0;

      return {
        operationId: op.operationId.toLowerCase(),
        timelockAddress: op.timelockAddress,
        scheduledTxHash: op.scheduledTxHash,
        queueBlock,
        stages: op.stages,
      };
    });

    debug.cache(
      "extracted %d timelock operations from bundled cache",
      ops.length
    );
    return ops;
  } catch {
    return [];
  }
}
