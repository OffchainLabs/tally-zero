import type { CacheAdapter } from "@gzeoneth/gov-tracker";

import {
  BUNDLED_CACHE_BATCH_SIZE,
  BUNDLED_CACHE_MAX_RETRIES,
  BUNDLED_CACHE_RETRY_DELAY_MS,
  STORAGE_KEYS,
} from "@/config/storage-keys";
import { findByAddress } from "@/lib/address-utils";
import type { ParsedProposal, ProposalStateName } from "@/types/proposal";
import {
  ARBITRUM_CHAIN_ID,
  ARBITRUM_GOVERNORS,
} from "@config/arbitrum-governance";

import { debug } from "./debug";
import { getStoredValue } from "./storage-utils";

let bundledCacheInitialized = false;
let bundledCacheData: Record<string, unknown> | null = null;

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

async function loadBundledCache(): Promise<Record<string, unknown>> {
  if (bundledCacheData) return bundledCacheData;

  const imported = await import("@gzeoneth/gov-tracker/bundled-cache.json");
  bundledCacheData = imported.default as Record<string, unknown>;
  return bundledCacheData;
}

export async function initializeBundledCache(
  cache: CacheAdapter
): Promise<void> {
  if (bundledCacheInitialized) {
    return;
  }

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
    const existingKeys = new Set(await cache.keys());

    // Filter to only entries that don't already exist in cache
    const newEntries = entries.filter(([key]) => !existingKeys.has(key));

    if (newEntries.length === 0) {
      debug.cache(
        "cache already has all %d bundled checkpoints",
        entries.length
      );
      bundledCacheInitialized = true;
      return;
    }

    debug.cache(
      "merging %d new bundled checkpoints (existing: %d)",
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

    debug.cache(
      "merged %d bundled checkpoints (total: %d)",
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
  bundledCacheData = null;
}

/** Bundled cache watermark with L2 block */
export interface BundledCacheWatermark {
  l2Block: number;
  coreGovernorBlock: number;
  treasuryGovernorBlock: number;
}

/**
 * Get the L2 block watermark from bundled cache
 * This indicates the block up to which proposals are cached
 */
export async function getBundledCacheWatermark(): Promise<BundledCacheWatermark | null> {
  try {
    const cache = await loadBundledCache();
    const watermarks = cache["discovery:watermarks"] as {
      lastProcessedBlock?: { l2?: number };
      cachedData?: {
        discoveryWatermarks?: {
          constitutionalGovernor?: number;
          nonConstitutionalGovernor?: number;
        };
      };
    };

    if (!watermarks?.cachedData?.discoveryWatermarks) {
      return null;
    }

    const { discoveryWatermarks } = watermarks.cachedData;
    return {
      l2Block: watermarks.lastProcessedBlock?.l2 ?? 0,
      coreGovernorBlock: discoveryWatermarks.constitutionalGovernor ?? 0,
      treasuryGovernorBlock: discoveryWatermarks.nonConstitutionalGovernor ?? 0,
    };
  } catch {
    return null;
  }
}

/** Stage data from bundled cache checkpoint */
interface BundledStageData {
  type: string;
  status: string;
  transactions?: Array<{ hash: string; blockNumber: number }>;
  data?: Record<string, unknown>;
}

/** Checkpoint structure from bundled cache */
interface BundledCheckpoint {
  input?: {
    type?: string;
    proposalId?: string;
    governorAddress?: string;
    creationTxHash?: string;
  };
  lastProcessedStage?: string;
  cachedData?: {
    completedStages?: BundledStageData[];
  };
}

/** Map gov-tracker stage to proposal state */
function stageToState(
  lastStage: string | undefined,
  votingStatus: string | undefined
): ProposalStateName {
  if (!lastStage) return "Pending";

  // Check voting outcome first
  if (lastStage === "VOTING_ACTIVE") {
    if (votingStatus === "FAILED") return "Defeated";
    if (votingStatus === "COMPLETED") return "Succeeded";
    return "Active";
  }

  // Pre-voting
  if (lastStage === "PROPOSAL_CREATED") return "Pending";

  // Post-voting stages indicate queued or executed
  const postVotingStages = [
    "L2_TIMELOCK_QUEUED",
    "L2_TIMELOCK_EXECUTED",
    "L2_TO_L1_MESSAGE",
    "L1_TIMELOCK_QUEUED",
    "L1_TIMELOCK_EXECUTED",
    "RETRYABLE_CREATED",
  ];
  if (postVotingStages.includes(lastStage)) return "Queued";

  // Final execution
  if (lastStage === "RETRYABLE_EXECUTED") return "Executed";

  return "Pending";
}

/**
 * Extract full proposal data directly from bundled cache
 * Returns ParsedProposal objects without any RPC calls
 */
export async function extractProposalsFromBundledCache(): Promise<{
  proposals: ParsedProposal[];
  activeProposalIds: Set<string>;
}> {
  const proposals: ParsedProposal[] = [];
  const activeProposalIds = new Set<string>();

  try {
    const cache = await loadBundledCache();

    for (const [key, value] of Object.entries(cache)) {
      if (!key.startsWith("tx:")) continue;

      const checkpoint = value as BundledCheckpoint;
      if (checkpoint.input?.type !== "governor") continue;

      const { proposalId, governorAddress, creationTxHash } = checkpoint.input;
      if (!proposalId || !governorAddress) continue;

      const stages = checkpoint.cachedData?.completedStages ?? [];
      const createdStage = stages.find((s) => s.type === "PROPOSAL_CREATED");
      const votingStage = stages.find((s) => s.type === "VOTING_ACTIVE");

      if (!createdStage?.data) continue;

      const data = createdStage.data;
      const voteData = votingStage?.data;

      const state = stageToState(
        checkpoint.lastProcessedStage,
        votingStage?.status
      );

      // Track active proposals that need refresh
      if (state === "Pending" || state === "Active") {
        activeProposalIds.add(proposalId);
      }

      const governor = findByAddress(ARBITRUM_GOVERNORS, governorAddress);

      proposals.push({
        id: proposalId,
        contractAddress: governorAddress as `0x${string}`,
        proposer: (data.proposer as string) ?? "",
        targets: (data.targets as string[]) ?? [],
        values: (data.values as string[]) ?? [],
        signatures: (data.signatures as string[]) ?? [],
        calldatas: (data.calldatas as string[]) ?? [],
        startBlock: String(data.startBlock ?? "0"),
        endBlock: String(data.endBlock ?? "0"),
        description: (data.description as string) ?? "",
        networkId: String(ARBITRUM_CHAIN_ID),
        state,
        governorName: governor?.name ?? "Unknown",
        creationTxHash: creationTxHash ?? key.slice(3),
        votes: voteData
          ? {
              forVotes: (voteData.forVotesRaw as string) ?? "0",
              againstVotes: (voteData.againstVotesRaw as string) ?? "0",
              abstainVotes: (voteData.abstainVotesRaw as string) ?? "0",
              quorum: (voteData.quorumRaw as string) ?? undefined,
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
