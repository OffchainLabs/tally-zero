/**
 * Build Proposal Cache Script
 *
 * Fetches all proposals from Arbitrum governors and saves them as a JSON cache.
 * This cache is used to give clients a head start when loading the app.
 * Also tracks lifecycle stages for proposals that have progressed past voting.
 *
 * Usage:
 *   yarn cache:build          # Production: from block 70398215
 *   yarn cache:build:dev      # Development: from block 362589350
 *   yarn cache:build:force    # Force full refresh
 *
 * Environment variables:
 *   START_BLOCK - Override the starting block (default depends on mode)
 *   RPC_URL - Override the RPC URL (default: https://arb1.arbitrum.io/rpc)
 *   L1_RPC_URL - Override the L1 RPC URL (default: https://1rpc.io/eth)
 *   L1_CHUNK_SIZE - Override L1 block range per query (default: 100000)
 *   SKIP_STAGES - Set to "true" to skip stage tracking (faster builds)
 *   DEBUG_STAGE_TRACKER - Set to "false" to disable verbose debug logging
 *
 * Environment files:
 *   .env.local - Loaded first (preferred for local overrides)
 *   .env - Loaded as fallback
 */

import * as dotenv from "dotenv";
import * as path from "path";

// Load environment variables from .env.local first, then .env as fallback
// Note: dotenv doesn't override existing variables, so .env.local takes precedence
dotenv.config({ path: path.resolve(__dirname, "..", ".env.local") });
dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

import { ethers } from "ethers";
import * as fs from "fs";

import { PROPOSAL_STATE_NAMES } from "../config/arbitrum-governance";
import { addressesEqual, findByAddress } from "../lib/address-utils";
import { delay } from "../lib/delay-utils";
import { fetchProposalStateAndVotes } from "../lib/governor-search";
import { batchQueryWithRateLimit } from "../lib/rpc-utils";
import { createProposalTracker } from "../lib/stage-tracker";
import {
  hasExceededTrackingAge,
  hasReachedFinalStage,
  isCacheExpired,
} from "../lib/stages-cache";
import type { ParsedProposal } from "../types/proposal";
import type { ProposalStage } from "../types/proposal-stage";
import type { Address } from "../types/search";

// Configuration
const ARBITRUM_CHAIN_ID = 42161;
const ARBITRUM_RPC_URL = process.env.RPC_URL || "https://arb1.arbitrum.io/rpc";
const ETHEREUM_RPC_URL = process.env.L1_RPC_URL || "https://1rpc.io/eth";
const SKIP_STAGES = process.env.SKIP_STAGES === "true";
const L1_CHUNK_SIZE = process.env.L1_CHUNK_SIZE
  ? parseInt(process.env.L1_CHUNK_SIZE, 10)
  : undefined; // Use default from config if not specified

// Production start block (first governance proposal era)
const PRODUCTION_START_BLOCK = 70398215;

// Development start block (for faster testing)
const DEV_START_BLOCK = 362589350;

// Governor contracts
const GOVERNORS = [
  {
    id: "core",
    address: "0xf07DeD9dC292157749B6Fd268E37DF6EA38395B9",
    name: "Core Governor",
  },
  {
    id: "treasury",
    address: "0x789fC99093B09aD01C34DC7251D0C89ce743e5a4",
    name: "Treasury Governor",
  },
];

// Re-type imported PROPOSAL_STATE_NAMES for use with ParsedProposal["state"]
const getStateName = (stateNum: number): ParsedProposal["state"] =>
  (PROPOSAL_STATE_NAMES[stateNum as keyof typeof PROPOSAL_STATE_NAMES] ??
    "Pending") as ParsedProposal["state"];

// Minimal ABI for Governor contract
const GOVERNOR_ABI = [
  "event ProposalCreated(uint256 proposalId, address proposer, address[] targets, uint256[] values, string[] signatures, bytes[] calldatas, uint256 startBlock, uint256 endBlock, string description)",
  "function state(uint256 proposalId) view returns (uint8)",
  "function proposalVotes(uint256 proposalId) view returns (uint256 againstVotes, uint256 forVotes, uint256 abstainVotes)",
  "function quorum(uint256 blockNumber) view returns (uint256)",
];

// Block range for queries (Arbitrum RPC can handle large ranges)
const BLOCK_RANGE = 10_000_000;

// Batch size for parallel queries
const BATCH_SIZE = 3;
const DELAY_BETWEEN_BATCHES = 1000;

interface RawProposal {
  id: string;
  contractAddress: string;
  proposer: string;
  targets: string[];
  values: string[];
  signatures: string[];
  calldatas: string[];
  startBlock: string;
  endBlock: string;
  description: string;
  creationTxHash: string;
}

interface ProposalCache {
  version: number;
  generatedAt: string;
  snapshotBlock: number;
  startBlock: number;
  chainId: number;
  proposals: ParsedProposal[];
  governorStats: {
    [address: string]: {
      name: string;
      proposalCount: number;
    };
  };
}

/**
 * Timelock operation entry for the prebuilt cache
 */
interface TimelockOperationEntry {
  txHash: string;
  operationId: string;
  timelockAddress: string;
  queueBlockNumber: number;
  stages: ProposalStage[];
  trackedAt: string;
}

/**
 * Prebuilt timelock operations cache
 * Stores stages 4-10 for completed proposals
 */
interface TimelockOperationsCache {
  version: number;
  generatedAt: string;
  operations: TimelockOperationEntry[];
}

async function fetchProposalsFromGovernor(
  provider: ethers.providers.JsonRpcProvider,
  governor: (typeof GOVERNORS)[number],
  startBlock: number,
  currentBlock: number,
  onProgress: (processed: number, total: number) => void
): Promise<RawProposal[]> {
  const contract = new ethers.Contract(
    governor.address,
    GOVERNOR_ABI,
    provider
  );
  const proposalCreatedFilter = contract.filters.ProposalCreated();

  const queries: (() => Promise<ethers.Event[]>)[] = [];
  const totalBlocks = currentBlock - startBlock;
  let processedBlocks = 0;

  // Create query chunks
  for (
    let fromBlock = startBlock;
    fromBlock <= currentBlock;
    fromBlock += BLOCK_RANGE
  ) {
    const toBlock = Math.min(fromBlock + BLOCK_RANGE - 1, currentBlock);
    const queryFromBlock = fromBlock;
    const queryToBlock = toBlock;

    queries.push(async () => {
      try {
        const events = await contract.queryFilter(
          proposalCreatedFilter,
          queryFromBlock,
          queryToBlock
        );
        processedBlocks += queryToBlock - queryFromBlock;
        onProgress(processedBlocks, totalBlocks);
        return events;
      } catch (error) {
        console.warn(
          `  Query failed for block range ${queryFromBlock}-${queryToBlock}:`,
          error instanceof Error ? error.message : error
        );
        return [];
      }
    });
  }

  console.log(`  Executing ${queries.length} queries for ${governor.name}...`);
  const allEvents = await batchQueryWithRateLimit(
    queries,
    BATCH_SIZE,
    DELAY_BETWEEN_BATCHES
  );

  const proposals: RawProposal[] = [];

  for (const events of allEvents) {
    for (const event of events) {
      const args = event.args!;
      const {
        proposalId,
        proposer,
        targets,
        signatures,
        calldatas,
        startBlock: propStartBlock,
        endBlock: propEndBlock,
        description,
      } = args;
      const values = args[3] as ethers.BigNumber[];

      proposals.push({
        id: proposalId.toString(),
        contractAddress: governor.address,
        proposer,
        targets: Array.from(targets),
        values: Array.isArray(values)
          ? values.map((v: ethers.BigNumber) => v.toString())
          : [],
        signatures: Array.from(signatures),
        calldatas: Array.from(calldatas),
        startBlock: propStartBlock.toString(),
        endBlock: propEndBlock.toString(),
        description,
        creationTxHash: event.transactionHash,
      });
    }
  }

  return proposals;
}

async function parseProposals(
  provider: ethers.providers.JsonRpcProvider,
  proposals: RawProposal[]
): Promise<ParsedProposal[]> {
  const parsed: ParsedProposal[] = [];
  const total = proposals.length;

  console.log(`\nParsing ${total} proposals (fetching state and votes)...`);

  for (let i = 0; i < proposals.length; i++) {
    const proposal = proposals[i];
    try {
      const contract = new ethers.Contract(
        proposal.contractAddress,
        GOVERNOR_ABI,
        provider
      );

      const stateData = await fetchProposalStateAndVotes(
        contract,
        proposal.id,
        proposal.startBlock
      );

      const governor = findByAddress(GOVERNORS, proposal.contractAddress);

      parsed.push({
        ...proposal,
        contractAddress: proposal.contractAddress as Address,
        networkId: String(ARBITRUM_CHAIN_ID),
        state: getStateName(stateData.state),
        governorName: governor?.name || "Unknown",
        votes: {
          ...stateData.votes,
          quorum: stateData.quorum,
        },
      });

      // Progress update
      if ((i + 1) % 10 === 0 || i === proposals.length - 1) {
        process.stdout.write(`\r  Parsed ${i + 1}/${total} proposals`);
      }

      // Small delay between individual proposal queries
      if (i < proposals.length - 1) {
        await delay(100);
      }
    } catch (error) {
      console.warn(
        `\n  Failed to parse proposal ${proposal.id}:`,
        error instanceof Error ? error.message : error
      );
    }
  }

  console.log(""); // New line after progress
  return parsed;
}

/**
 * Load existing cache if available
 */
function loadExistingCache(outputPath: string): ProposalCache | null {
  try {
    if (fs.existsSync(outputPath)) {
      const data = JSON.parse(fs.readFileSync(outputPath, "utf-8"));
      // Validate basic structure
      if (
        data.version === 1 &&
        data.snapshotBlock &&
        Array.isArray(data.proposals)
      ) {
        return data as ProposalCache;
      }
    }
  } catch (error) {
    console.warn("  Could not load existing cache:", error);
  }
  return null;
}

/**
 * Get the estimated creation time of a proposal
 * Uses the first stage's transaction timestamp if available
 */
function getProposalCreationTime(proposal: ParsedProposal): number | null {
  if (proposal.stages && proposal.stages.length > 0) {
    const firstStage = proposal.stages[0];
    if (firstStage.transactions && firstStage.transactions.length > 0) {
      const timestamp = firstStage.transactions[0].timestamp;
      if (timestamp) {
        // Timestamp is in seconds, convert to ms
        return timestamp * 1000;
      }
    }
  }
  return null;
}

/**
 * Track lifecycle stages for all proposals
 *
 * Applies the same caching logic as the UI hook:
 * - Skip proposals that have reached their final stage
 * - Skip proposals where cache is not expired (TTL-based)
 * - Skip proposals that have exceeded the 60-day tracking window
 */
async function trackStagesForProposals(
  proposals: ParsedProposal[]
): Promise<ParsedProposal[]> {
  let skippedFinal = 0;
  let skippedCacheFresh = 0;
  let skippedTooOld = 0;

  // Filter proposals that need stage tracking
  const proposalsToTrack = proposals.filter((p) => {
    // Must have a creation tx hash
    if (!p.creationTxHash) {
      return false;
    }

    // Skip if proposal has reached its final stage for this governor
    if (p.stages && hasReachedFinalStage(p.stages, p.contractAddress)) {
      skippedFinal++;
      return false;
    }

    // Skip if cache is still fresh (not expired by TTL)
    if (p.stagesTrackedAt && !isCacheExpired(p.stagesTrackedAt)) {
      skippedCacheFresh++;
      return false;
    }

    // Skip if tracking has exceeded 60 days from proposal creation
    const creationTime = getProposalCreationTime(p);
    if (
      creationTime &&
      p.stagesTrackedAt &&
      hasExceededTrackingAge(p.stagesTrackedAt, creationTime)
    ) {
      skippedTooOld++;
      return false;
    }

    return true;
  });

  console.log("\nStage tracking filter results:");
  console.log(`  - Proposals at final stage: ${skippedFinal} (skipped)`);
  console.log(`  - Proposals with fresh cache: ${skippedCacheFresh} (skipped)`);
  console.log(
    `  - Proposals exceeded 60-day window: ${skippedTooOld} (skipped)`
  );
  console.log(`  - Proposals to track: ${proposalsToTrack.length}`);

  if (proposalsToTrack.length === 0) {
    console.log("\nNo proposals need stage tracking");
    return proposals;
  }

  console.log(`\nTracking stages for ${proposalsToTrack.length} proposals...`);

  const proposalMap = new Map(proposals.map((p) => [p.id, p]));
  let completed = 0;
  let failed = 0;

  for (let i = 0; i < proposalsToTrack.length; i++) {
    const proposal = proposalsToTrack[i];
    const startTime = Date.now();
    console.log(
      `\n[${new Date().toISOString()}] Tracking ${i + 1}/${proposalsToTrack.length}: ${proposal.id.slice(0, 20)}...`
    );
    console.log(
      `  State: ${proposal.state}, Governor: ${proposal.governorName}`
    );
    console.log(`  Existing stages: ${proposal.stages?.length ?? 0}`);

    try {
      console.log(`  [DEBUG] Creating tracker and tracking proposal...`);
      const tracker = createProposalTracker(ARBITRUM_RPC_URL, ETHEREUM_RPC_URL);
      const results = await tracker.trackByTxHash(proposal.creationTxHash!);

      // Use first result (governor proposals return single result)
      const trackingResult = results[0];
      const result = {
        stages: trackingResult?.stages ?? [],
        timelockLink: trackingResult?.timelockLink,
        error: trackingResult ? undefined : "No tracking result returned",
      };

      const elapsedMs = Date.now() - startTime;
      console.log(`  [DEBUG] Tracking completed in ${elapsedMs}ms`);
      console.log(
        `  [DEBUG] Stages returned: ${result.stages.length}, error: ${result.error ?? "none"}`
      );

      if (result.error) {
        console.warn(`  Warning: ${result.error}`);
        failed++;
      } else {
        completed++;
      }

      // Update proposal with tracked stages and timelockLink
      const updatedProposal: ParsedProposal = {
        ...proposal,
        stages: result.stages.length > 0 ? result.stages : proposal.stages,
        stagesTrackedAt: new Date().toISOString(),
        timelockLink: result.timelockLink ?? proposal.timelockLink,
      };
      proposalMap.set(proposal.id, updatedProposal);

      // Delay between proposals to avoid rate limiting
      if (i < proposalsToTrack.length - 1) {
        await delay(500);
      }
    } catch (error) {
      console.warn(
        `\n  Error tracking ${proposal.id}:`,
        error instanceof Error ? error.message : error
      );
      failed++;
    }
  }

  console.log(
    `\n  Stage tracking complete: ${completed} succeeded, ${failed} failed`
  );

  return proposals.map((p) => proposalMap.get(p.id) || p);
}

/**
 * Get the stage index to resume tracking from
 */
function getResumeStageIndex(stages: ProposalStage[]): number {
  // Find the first stage that isn't completed
  for (let i = 0; i < stages.length; i++) {
    if (stages[i].status !== "COMPLETED") {
      return i;
    }
  }
  return stages.length;
}

/**
 * Stage types that belong to proposal cache (stages 1-3)
 */
const PROPOSAL_STAGE_TYPES = [
  "PROPOSAL_CREATED",
  "VOTING_ACTIVE",
  "PROPOSAL_QUEUED",
];

/**
 * Split stages into proposal stages (1-3) and timelock stages (4-10)
 */
function splitStages(stages: ProposalStage[]): {
  proposalStages: ProposalStage[];
  timelockStages: ProposalStage[];
} {
  const proposalStages = stages.filter((s) =>
    PROPOSAL_STAGE_TYPES.includes(s.type)
  );
  const timelockStages = stages.filter(
    (s) => !PROPOSAL_STAGE_TYPES.includes(s.type)
  );
  return { proposalStages, timelockStages };
}

/**
 * Extract timelock operations from proposals with timelockLinks
 */
function extractTimelockOperations(
  proposals: ParsedProposal[]
): TimelockOperationEntry[] {
  const operations: TimelockOperationEntry[] = [];
  const seenKeys = new Set<string>();

  for (const proposal of proposals) {
    if (!proposal.timelockLink || !proposal.stages) continue;

    const { txHash, operationId, timelockAddress, queueBlockNumber } =
      proposal.timelockLink;
    const key = `${txHash.toLowerCase()}-${operationId.toLowerCase()}`;

    // Skip duplicates
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);

    const { timelockStages } = splitStages(proposal.stages);
    if (timelockStages.length === 0) continue;

    operations.push({
      txHash,
      operationId,
      timelockAddress,
      queueBlockNumber,
      stages: timelockStages,
      trackedAt: proposal.stagesTrackedAt || new Date().toISOString(),
    });
  }

  return operations;
}

/**
 * Prepare proposal for cache by keeping only stages 1-3
 */
function prepareProposalForCache(proposal: ParsedProposal): ParsedProposal {
  if (!proposal.stages) return proposal;

  const { proposalStages } = splitStages(proposal.stages);

  return {
    ...proposal,
    stages: proposalStages.length > 0 ? proposalStages : undefined,
  };
}

/**
 * Refresh state for pending/active proposals
 */
async function refreshProposalStates(
  provider: ethers.providers.JsonRpcProvider,
  proposals: ParsedProposal[]
): Promise<ParsedProposal[]> {
  const refreshed: ParsedProposal[] = [];
  const total = proposals.length;

  console.log(`\nRefreshing ${total} pending/active proposals...`);

  for (let i = 0; i < proposals.length; i++) {
    const proposal = proposals[i];
    try {
      const contract = new ethers.Contract(
        proposal.contractAddress,
        GOVERNOR_ABI,
        provider
      );

      const stateData = await fetchProposalStateAndVotes(
        contract,
        proposal.id,
        proposal.startBlock
      );

      refreshed.push({
        ...proposal,
        state: getStateName(stateData.state),
        votes: {
          ...stateData.votes,
          quorum: stateData.quorum,
        },
      });

      if ((i + 1) % 5 === 0 || i === proposals.length - 1) {
        process.stdout.write(`\r  Refreshed ${i + 1}/${total} proposals`);
      }

      if (i < proposals.length - 1) {
        await delay(100);
      }
    } catch {
      // Keep existing version if refresh fails
      refreshed.push(proposal);
    }
  }

  console.log("");
  return refreshed;
}

async function main() {
  const isDev = process.argv.includes("--dev");
  const forceRefresh = process.argv.includes("--force");
  const outputPath = path.join(__dirname, "..", "data", "proposal-cache.json");

  console.log("========================================");
  console.log("  Arbitrum Proposal Cache Builder");
  console.log("========================================");
  console.log(`Mode: ${isDev ? "Development" : "Production"}`);
  console.log(`L2 RPC URL: ${ARBITRUM_RPC_URL}`);
  console.log(`L1 RPC URL: ${ETHEREUM_RPC_URL}`);
  console.log(`L1 Chunk Size: ${L1_CHUNK_SIZE ?? "default (100000)"}`);
  console.log(`Force refresh: ${forceRefresh}`);
  console.log(`Skip stages: ${SKIP_STAGES}`);
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log("");

  // Check for existing cache
  const existingCache = forceRefresh ? null : loadExistingCache(outputPath);

  // Determine start block
  let startBlock: number;
  let existingProposals: ParsedProposal[] = [];

  if (existingCache && existingCache.proposals.length > 0) {
    // Incremental update: start from existing snapshot + 1
    startBlock = existingCache.snapshotBlock + 1;
    existingProposals = existingCache.proposals;
    console.log(
      `Found existing cache with ${existingCache.proposals.length} proposals`
    );
    console.log(
      `Last snapshot block: ${existingCache.snapshotBlock.toLocaleString()}`
    );
    console.log(
      `Updating incrementally from block ${startBlock.toLocaleString()}`
    );
  } else {
    // Fresh build: use configured start block
    startBlock = process.env.START_BLOCK
      ? parseInt(process.env.START_BLOCK, 10)
      : isDev
        ? DEV_START_BLOCK
        : PRODUCTION_START_BLOCK;
    console.log(
      `Building fresh cache from block ${startBlock.toLocaleString()}`
    );
  }
  console.log("");

  // Connect to provider
  console.log("Connecting to Arbitrum...");
  const provider = new ethers.providers.JsonRpcProvider(ARBITRUM_RPC_URL);
  await provider.ready;
  const currentBlock = await provider.getBlockNumber();
  console.log(`Current block: ${currentBlock.toLocaleString()}`);

  const blocksToScan = currentBlock - startBlock;
  if (blocksToScan <= 0) {
    console.log("\nCache is already up to date!");
    return;
  }

  console.log(`Blocks to scan: ${blocksToScan.toLocaleString()}`);
  console.log("");

  // Fetch new proposals from all governors
  const newRawProposals: RawProposal[] = [];
  const governorStats: ProposalCache["governorStats"] = {};

  for (const governor of GOVERNORS) {
    console.log(`Fetching proposals from ${governor.name}...`);
    console.log(`  Address: ${governor.address}`);

    const proposals = await fetchProposalsFromGovernor(
      provider,
      governor,
      startBlock,
      currentBlock,
      (processed, total) => {
        const percent = Math.round((processed / total) * 100);
        process.stdout.write(`\r  Progress: ${percent}%`);
      }
    );

    console.log(`\n  Found ${proposals.length} new proposals`);
    newRawProposals.push(...proposals);

    // Count total proposals for this governor (existing + new)
    const existingCount = existingProposals.filter((p) =>
      addressesEqual(p.contractAddress, governor.address)
    ).length;
    governorStats[governor.address] = {
      name: governor.name,
      proposalCount: existingCount + proposals.length,
    };
  }

  console.log(`\nNew proposals found: ${newRawProposals.length}`);

  // Parse new proposals
  let newParsedProposals: ParsedProposal[] = [];
  if (newRawProposals.length > 0) {
    newParsedProposals = await parseProposals(provider, newRawProposals);
  }

  // Refresh state for pending/active proposals from existing cache
  const proposalsToRefresh = existingProposals.filter(
    (p) => p.state === "Pending" || p.state === "Active"
  );

  let refreshedProposals: ParsedProposal[] = [];
  if (proposalsToRefresh.length > 0) {
    refreshedProposals = await refreshProposalStates(
      provider,
      proposalsToRefresh
    );
  }

  // Merge all proposals:
  // 1. Finalized existing proposals (unchanged)
  // 2. Refreshed pending/active proposals
  // 3. New proposals
  const finalizedExisting = existingProposals.filter(
    (p) => p.state !== "Pending" && p.state !== "Active"
  );

  const refreshedMap = new Map(refreshedProposals.map((p) => [p.id, p]));
  const mergedExisting = existingProposals.map((p) => {
    const refreshed = refreshedMap.get(p.id);
    return refreshed ?? p;
  });

  // Add new proposals (avoiding duplicates by ID)
  const existingIds = new Set(mergedExisting.map((p) => p.id));
  const uniqueNewProposals = newParsedProposals.filter(
    (p) => !existingIds.has(p.id)
  );

  let allProposals = [...mergedExisting, ...uniqueNewProposals];

  // Track lifecycle stages for proposals that have progressed past voting
  if (!SKIP_STAGES) {
    allProposals = await trackStagesForProposals(allProposals);
  }

  // Sort: active first, then by startBlock descending
  allProposals.sort((a, b) => {
    if (a.state === "Active" && b.state !== "Active") return -1;
    if (a.state !== "Active" && b.state === "Active") return 1;
    return parseInt(b.startBlock, 10) - parseInt(a.startBlock, 10);
  });

  // Update governor stats
  for (const governor of GOVERNORS) {
    governorStats[governor.address] = {
      name: governor.name,
      proposalCount: allProposals.filter((p) =>
        addressesEqual(p.contractAddress, governor.address)
      ).length,
    };
  }

  // Extract timelock operations (stages 4-10) before stripping from proposals
  const timelockOperations = extractTimelockOperations(allProposals);

  // Prepare proposals for cache (keep only stages 1-3)
  const proposalsForCache = allProposals.map(prepareProposalForCache);

  // Create proposal cache object (stages 1-3 only)
  const cache: ProposalCache = {
    version: 1,
    generatedAt: new Date().toISOString(),
    snapshotBlock: currentBlock,
    startBlock: existingCache?.startBlock ?? startBlock,
    chainId: ARBITRUM_CHAIN_ID,
    proposals: proposalsForCache,
    governorStats,
  };

  // Create timelock operations cache object (stages 4-10)
  const timelockCache: TimelockOperationsCache = {
    version: 1,
    generatedAt: new Date().toISOString(),
    operations: timelockOperations,
  };

  // Write proposal cache
  const timelockOutputPath = path.join(
    __dirname,
    "..",
    "data",
    "timelock-operations-cache.json"
  );
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(cache, null, 2));

  // Write timelock operations cache
  fs.writeFileSync(timelockOutputPath, JSON.stringify(timelockCache, null, 2));

  console.log("\n========================================");
  console.log("  Cache Build Complete!");
  console.log("========================================");
  console.log(`Proposal cache: ${outputPath}`);
  console.log(`Timelock cache: ${timelockOutputPath}`);
  console.log(`Total proposals: ${allProposals.length}`);
  console.log(`  - Existing (finalized): ${finalizedExisting.length}`);
  console.log(`  - Refreshed (pending/active): ${refreshedProposals.length}`);
  console.log(`  - New: ${uniqueNewProposals.length}`);
  console.log(`Snapshot block: ${currentBlock.toLocaleString()}`);
  console.log(
    `Proposal cache size: ${(fs.statSync(outputPath).size / 1024).toFixed(2)} KB`
  );
  console.log(
    `Timelock cache size: ${(fs.statSync(timelockOutputPath).size / 1024).toFixed(2)} KB`
  );
  console.log("");

  // Summary by state
  const stateCounts: Record<string, number> = {};
  for (const p of allProposals) {
    stateCounts[p.state] = (stateCounts[p.state] || 0) + 1;
  }
  console.log("Proposals by state:");
  for (const [state, count] of Object.entries(stateCounts).sort()) {
    console.log(`  ${state}: ${count}`);
  }

  // Summary of stage tracking
  const proposalsWithStages = allProposals.filter(
    (p) => p.stages && p.stages.length > 0
  );
  const proposalsAtFinalStage = allProposals.filter(
    (p) => p.stages && hasReachedFinalStage(p.stages, p.contractAddress)
  );
  const proposalsWithTimelockLink = allProposals.filter((p) => p.timelockLink);
  console.log("");
  console.log("Stage tracking:");
  console.log(`  Proposals with stages: ${proposalsWithStages.length}`);
  console.log(`  Proposals at final stage: ${proposalsAtFinalStage.length}`);
  console.log(
    `  Proposals with timelockLink: ${proposalsWithTimelockLink.length}`
  );
  console.log(`  Timelock operations cached: ${timelockOperations.length}`);
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
