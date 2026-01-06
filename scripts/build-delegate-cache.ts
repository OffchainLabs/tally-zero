/**
 * Build Delegate Cache Script
 *
 * Fetches all DelegateVotesChanged events from ARB token contract and saves them as a JSON cache.
 * This cache provides a snapshot of all delegates with their current voting power.
 *
 * Usage:
 *   yarn cache:build:delegates      # Production: from block 70398215
 *   yarn cache:build:delegates:dev  # Development: from block 362589350
 *   yarn cache:build:delegates:force # Force full refresh
 *
 * Environment variables:
 *   START_BLOCK - Override the starting block (default depends on mode)
 *   RPC_URL - Override the RPC URL (default: https://arb1.arbitrum.io/rpc)
 */

import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";

import { addressesEqual } from "../lib/address-utils";
import { batchQueryWithRateLimit } from "../lib/rpc-utils";
import type { DelegateCache, DelegateInfo } from "../types/delegate";
import type { Address } from "../types/search";

// Configuration
const ARBITRUM_CHAIN_ID = 42161;
const ARBITRUM_RPC_URL = process.env.RPC_URL || "https://arb1.arbitrum.io/rpc";

// Production start block (first governance proposal era)
const PRODUCTION_START_BLOCK = 70398215;

// Development start block (for faster testing)
const DEV_START_BLOCK = 362589350;

// ARB token contract
const ARB_TOKEN_ADDRESS = "0x912CE59144191C1204E64559FE8253a0e49E6548";

// Excluded address (system address to filter out)
const EXCLUDED_ADDRESS = "0x00000000000000000000000000000000000A4B86";

// Minimal ABI for ARB token
const ARB_TOKEN_ABI = [
  "event DelegateVotesChanged(address indexed delegate, uint256 previousBalance, uint256 newBalance)",
  "function totalSupply() view returns (uint256)",
];

// Block range for queries (ARB token has many delegate events, use smaller chunks)
// Note: 1M blocks can timeout on public RPC during high-activity periods
const BLOCK_RANGE = 500_000;

// Batch size for parallel queries
const BATCH_SIZE = 3;
const DELAY_BETWEEN_BATCHES = 1000;

interface RawDelegateEvent {
  delegate: string;
  previousBalance: string;
  newBalance: string;
  blockNumber: number;
  txHash: string;
}

async function fetchDelegateEvents(
  provider: ethers.providers.JsonRpcProvider,
  startBlock: number,
  currentBlock: number,
  onProgress: (processed: number, total: number) => void
): Promise<RawDelegateEvent[]> {
  const contract = new ethers.Contract(
    ARB_TOKEN_ADDRESS,
    ARB_TOKEN_ABI,
    provider
  );
  const delegateVotesChangedFilter = contract.filters.DelegateVotesChanged();

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
          delegateVotesChangedFilter,
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

  console.log(`  Executing ${queries.length} queries for delegate events...`);
  const allEvents = await batchQueryWithRateLimit(
    queries,
    BATCH_SIZE,
    DELAY_BETWEEN_BATCHES
  );

  const events: RawDelegateEvent[] = [];

  for (const eventBatch of allEvents) {
    for (const event of eventBatch) {
      const args = event.args!;
      const { delegate, previousBalance, newBalance } = args;

      // Skip excluded address
      if (addressesEqual(delegate, EXCLUDED_ADDRESS)) {
        continue;
      }

      events.push({
        delegate,
        previousBalance: previousBalance.toString(),
        newBalance: newBalance.toString(),
        blockNumber: event.blockNumber,
        txHash: event.transactionHash,
      });
    }
  }

  return events;
}

/**
 * Load existing cache if available
 */
function loadExistingCache(outputPath: string): DelegateCache | null {
  try {
    if (fs.existsSync(outputPath)) {
      const data = JSON.parse(fs.readFileSync(outputPath, "utf-8"));
      // Validate basic structure
      if (
        data.version === 1 &&
        data.snapshotBlock &&
        Array.isArray(data.delegates)
      ) {
        return data as DelegateCache;
      }
    }
  } catch (error) {
    console.warn("  Could not load existing cache:", error);
  }
  return null;
}

/**
 * Build delegate map from events, keeping only the most recent event per delegate
 */
function buildDelegateMap(
  events: RawDelegateEvent[]
): Map<string, DelegateInfo> {
  const delegateMap = new Map<string, DelegateInfo>();

  // Sort events by block number ascending to process in chronological order
  const sortedEvents = [...events].sort(
    (a, b) => a.blockNumber - b.blockNumber
  );

  for (const event of sortedEvents) {
    const address = event.delegate as Address;

    // Update or create delegate entry with latest voting power
    delegateMap.set(address.toLowerCase(), {
      address,
      votingPower: event.newBalance,
      lastChangeBlock: event.blockNumber,
      lastChangeTxHash: event.txHash,
    });
  }

  return delegateMap;
}

/**
 * Filter out delegates with zero voting power and sort by voting power descending
 */
function processDelegates(
  delegateMap: Map<string, DelegateInfo>
): DelegateInfo[] {
  const delegates: DelegateInfo[] = [];

  for (const delegate of Array.from(delegateMap.values())) {
    // Filter out zero voting power
    if (ethers.BigNumber.from(delegate.votingPower).gt(0)) {
      delegates.push(delegate);
    }
  }

  // Sort by voting power descending
  delegates.sort((a, b) => {
    const aBN = ethers.BigNumber.from(a.votingPower);
    const bBN = ethers.BigNumber.from(b.votingPower);

    if (aBN.gt(bBN)) return -1;
    if (aBN.lt(bBN)) return 1;
    return 0;
  });

  return delegates;
}

/**
 * Calculate total voting power from delegates
 */
function calculateTotalVotingPower(delegates: DelegateInfo[]): string {
  let total = ethers.BigNumber.from(0);

  for (const delegate of delegates) {
    total = total.add(ethers.BigNumber.from(delegate.votingPower));
  }

  return total.toString();
}

/**
 * Merge existing cache with new events
 */
function mergeWithExistingCache(
  existingCache: DelegateCache | null,
  newEvents: RawDelegateEvent[]
): { delegateMap: Map<string, DelegateInfo>; totalEventsProcessed: number } {
  const delegateMap = new Map<string, DelegateInfo>();
  let totalEventsProcessed = 0;

  // Start with existing delegates if available
  if (existingCache) {
    for (const delegate of existingCache.delegates) {
      delegateMap.set(delegate.address.toLowerCase(), delegate);
    }
    totalEventsProcessed = existingCache.stats.eventsProcessed;
  }

  // Apply new events
  const newDelegateMap = buildDelegateMap(newEvents);
  for (const [address, delegate] of Array.from(newDelegateMap.entries())) {
    delegateMap.set(address, delegate);
  }

  totalEventsProcessed += newEvents.length;

  return { delegateMap, totalEventsProcessed };
}

async function main() {
  const isDev = process.argv.includes("--dev");
  const forceRefresh = process.argv.includes("--force");
  const outputPath = path.join(__dirname, "..", "data", "delegate-cache.json");

  console.log("========================================");
  console.log("  Arbitrum Delegate Cache Builder");
  console.log("========================================");
  console.log(`Mode: ${isDev ? "Development" : "Production"}`);
  console.log(`RPC URL: ${ARBITRUM_RPC_URL}`);
  console.log(`Force refresh: ${forceRefresh}`);
  console.log("");

  // Check for existing cache
  const existingCache = forceRefresh ? null : loadExistingCache(outputPath);

  // Determine start block
  let startBlock: number;

  if (existingCache) {
    // Incremental update: start from existing snapshot + 1
    startBlock = existingCache.snapshotBlock + 1;
    console.log(
      `Found existing cache with ${existingCache.delegates.length} delegates`
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

  // Fetch delegate events
  console.log("Fetching DelegateVotesChanged events...");
  console.log(`  Token: ${ARB_TOKEN_ADDRESS}`);
  console.log(`  Excluded address: ${EXCLUDED_ADDRESS}`);

  const newEvents = await fetchDelegateEvents(
    provider,
    startBlock,
    currentBlock,
    (processed, total) => {
      const percent = Math.round((processed / total) * 100);
      process.stdout.write(`\r  Progress: ${percent}%`);
    }
  );

  console.log(`\n  Found ${newEvents.length} new events`);

  // Merge with existing cache
  console.log("\nProcessing delegates...");
  const { delegateMap, totalEventsProcessed } = mergeWithExistingCache(
    existingCache,
    newEvents
  );

  // Filter and sort delegates
  const delegates = processDelegates(delegateMap);
  console.log(`  Delegates with voting power: ${delegates.length}`);

  // Calculate totals
  const totalVotingPower = calculateTotalVotingPower(delegates);

  // Fetch total supply
  console.log("\nFetching ARB token total supply...");
  const contract = new ethers.Contract(
    ARB_TOKEN_ADDRESS,
    ARB_TOKEN_ABI,
    provider
  );
  const totalSupply = await contract.totalSupply();
  console.log(`  Total supply: ${ethers.utils.formatEther(totalSupply)} ARB`);

  // Create cache object
  const cache: DelegateCache = {
    version: 1,
    generatedAt: new Date().toISOString(),
    snapshotBlock: currentBlock,
    startBlock: existingCache?.startBlock ?? startBlock,
    chainId: ARBITRUM_CHAIN_ID,
    totalVotingPower: totalVotingPower,
    totalSupply: totalSupply.toString(),
    delegates,
    stats: {
      totalDelegates: delegates.length,
      eventsProcessed: totalEventsProcessed,
    },
  };

  // Write to file
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(cache, null, 2));

  console.log("\n========================================");
  console.log("  Cache Build Complete!");
  console.log("========================================");
  console.log(`Output: ${outputPath}`);
  console.log(`Total delegates: ${delegates.length}`);
  console.log(
    `Total events processed: ${totalEventsProcessed.toLocaleString()}`
  );
  console.log(`Snapshot block: ${currentBlock.toLocaleString()}`);
  console.log(
    `File size: ${(fs.statSync(outputPath).size / 1024).toFixed(2)} KB`
  );
  console.log("");

  // Summary statistics
  const topDelegates = delegates.slice(0, 10);
  console.log("Top 10 delegates by voting power:");
  for (let i = 0; i < topDelegates.length; i++) {
    const delegate = topDelegates[i];
    const votingPowerETH = ethers.utils.formatEther(delegate.votingPower);
    const percentage = (
      (parseFloat(votingPowerETH) /
        parseFloat(ethers.utils.formatEther(totalSupply))) *
      100
    ).toFixed(4);
    console.log(
      `  ${i + 1}. ${delegate.address} - ${parseFloat(votingPowerETH).toLocaleString()} ARB (${percentage}%)`
    );
  }

  console.log("");
  console.log("Distribution summary:");
  const totalVotingPowerETH = parseFloat(
    ethers.utils.formatEther(totalVotingPower)
  );
  const totalSupplyETH = parseFloat(ethers.utils.formatEther(totalSupply));
  const delegatedPercentage = (
    (totalVotingPowerETH / totalSupplyETH) *
    100
  ).toFixed(2);
  console.log(
    `  Total voting power: ${totalVotingPowerETH.toLocaleString()} ARB`
  );
  console.log(`  Percentage delegated: ${delegatedPercentage}%`);
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
