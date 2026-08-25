import { ethers } from "ethers";

import { findByAddress } from "@/lib/address-utils";
import { debug } from "@/lib/debug";
import {
  decodeResult,
  encodeCall,
  multicall,
  type MulticallInput,
  type MulticallResult,
} from "@/lib/multicall";
import { batchQueryWithRateLimit } from "@/lib/rpc-utils";
import { getStateName } from "@/lib/state-utils";
import type { ParsedProposal, Proposal } from "@/types/proposal";
import {
  ARBITRUM_CHAIN_ID,
  ARBITRUM_GOVERNORS,
} from "@config/arbitrum-governance";
import { BLOCKS_PER_DAY } from "@config/block-times";
import OZGovernor_ABI from "@data/OzGovernor_ABI.json";

/**
 * Creates a contract instance getter with caching.
 * Reuses contract instances for the same address to reduce memory and setup overhead.
 */
function createContractCache(provider: ethers.providers.Provider) {
  const contracts = new Map<string, ethers.Contract>();
  return (address: string): ethers.Contract => {
    if (!contracts.has(address)) {
      contracts.set(
        address,
        new ethers.Contract(address, OZGovernor_ABI, provider)
      );
    }
    return contracts.get(address)!;
  };
}

export interface ProposalStateData {
  state: number;
  votes: {
    forVotes: string;
    againstVotes: string;
    abstainVotes: string;
  };
  quorum?: string;
}

/**
 * Fetches proposal state, votes, and quorum from the governor contract.
 * Consolidates the common pattern used across multiple functions.
 */
export async function fetchProposalStateAndVotes(
  contract: ethers.Contract,
  proposalId: string,
  startBlock: string
): Promise<ProposalStateData> {
  const [proposalState, votes] = await Promise.all([
    contract.state(proposalId),
    contract.proposalVotes(proposalId),
  ]);

  let quorum: string | undefined;
  if (proposalState !== 0) {
    try {
      const quorumBN = await contract.quorum(startBlock);
      quorum = quorumBN.toString();
    } catch {
      // Quorum fetch can fail for some states
    }
  }

  return {
    state: proposalState,
    votes: {
      forVotes: votes.forVotes.toString(),
      againstVotes: votes.againstVotes.toString(),
      abstainVotes: votes.abstainVotes.toString(),
    },
    quorum,
  };
}

/**
 * Search a single governor contract for proposals
 */
export async function searchGovernor(
  provider: ethers.providers.Provider,
  contractAddress: string,
  startBlock: number,
  endBlock: number,
  blockRange: number,
  onProgress: (progress: number) => void
): Promise<Proposal[]> {
  const contract = new ethers.Contract(
    contractAddress,
    OZGovernor_ABI,
    provider
  );

  const proposalCreatedFilter = contract.filters.ProposalCreated();
  const queries: (() => Promise<ethers.Event[]>)[] = [];
  const totalBlocks = endBlock - startBlock;
  let processedBlocks = 0;

  for (
    let fromBlock = startBlock;
    fromBlock <= endBlock;
    fromBlock += blockRange
  ) {
    const toBlock = Math.min(fromBlock + blockRange - 1, endBlock);
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
        onProgress(Math.min((processedBlocks / totalBlocks) * 100, 100));
        return events;
      } catch (error) {
        debug.search(
          "query failed for block range %d-%d: %O",
          queryFromBlock,
          queryToBlock,
          error
        );
        return [];
      }
    });
  }

  // If no blocks to search, return empty
  if (queries.length === 0) {
    return [];
  }

  const allEvents = await batchQueryWithRateLimit(queries, 3, 1000);
  const proposals: Proposal[] = [];

  for (const events of allEvents) {
    for (const event of events) {
      const args = event.args;
      if (!args || args.proposalId === undefined) {
        debug.search(
          "skipping event with missing args in tx %s",
          event.transactionHash
        );
        continue;
      }

      // Destructure event args to avoid Array.prototype.values collision
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
      const proposalValues = args[3] as ethers.BigNumber[];

      proposals.push({
        id: proposalId.toString(),
        contractAddress: contractAddress,
        proposer,
        targets,
        values: Array.isArray(proposalValues)
          ? proposalValues.map((v) => v.toString())
          : [],
        signatures,
        calldatas,
        startBlock: propStartBlock.toString(),
        endBlock: propEndBlock.toString(),
        description,
        state: 0,
        creationTxHash: event.transactionHash,
      } as Proposal);
    }
  }

  return proposals;
}

/**
 * Search a governor contract for proposals within a day range
 */
export async function searchGovernorByDays(
  provider: ethers.providers.Provider,
  contractAddress: string,
  daysToSearch: number,
  blockRange: number,
  onProgress: (progress: number) => void
): Promise<Proposal[]> {
  const currentBlock = await provider.getBlockNumber();
  const blocksToSearch = BLOCKS_PER_DAY.arbitrum * daysToSearch;
  const startBlock = Math.max(currentBlock - blocksToSearch, 0);

  return searchGovernor(
    provider,
    contractAddress,
    startBlock,
    currentBlock,
    blockRange,
    onProgress
  );
}

/**
 * Parse raw proposals into ParsedProposal format with state and votes.
 * Batches RPC calls to reduce rate limiting issues.
 */
export async function parseProposals(
  provider: ethers.providers.Provider,
  proposals: Proposal[]
): Promise<ParsedProposal[]> {
  if (proposals.length === 0) return [];

  const getContract = createContractCache(provider);

  // Build batched queries for all proposals
  const queries = proposals.map((proposal) => async () => {
    const contract = getContract(proposal.contractAddress);
    try {
      const stateData = await fetchProposalStateAndVotes(
        contract,
        proposal.id,
        proposal.startBlock
      );

      const governor = findByAddress(
        ARBITRUM_GOVERNORS,
        proposal.contractAddress
      );

      return {
        ...proposal,
        networkId: String(ARBITRUM_CHAIN_ID),
        state: getStateName(stateData.state),
        governorName: governor?.name || "Unknown",
        creationTxHash: proposal.creationTxHash,
        votes: {
          ...stateData.votes,
          quorum: stateData.quorum,
        },
      } as ParsedProposal;
    } catch (e) {
      debug.search("failed to parse proposal: %O", e);
      return null;
    }
  });

  // Execute in batches of 5 with 500ms delay to avoid rate limits
  const results = await batchQueryWithRateLimit(queries, 5, 500);
  return results.filter((p): p is ParsedProposal => p !== null);
}

/**
 * How many proposals go into one `aggregate3` request. Each contributes two
 * calls, so this keeps a request at 50 calls: comfortably inside what public
 * RPCs return in one response, while still collapsing a whole table into a
 * request or two.
 */
const MULTICALL_PROPOSAL_CHUNK = 25;

/**
 * Refresh state and votes for existing proposals in a single RPC request.
 *
 * The proposals table withholds a row's status until this answers (see
 * `isProposalStateUnverified`), so its latency is a loading placeholder the
 * user is watching. Reading each proposal on its own cost two round trips
 * (`state` and `proposalVotes` together, then `quorum`) in batches of five with
 * a 500ms pause between them, which is seconds of placeholder for a table of
 * in-flight rows. Multicall3 collapses all of it into one round trip.
 *
 * What goes in the request is decided by what the status waits on. Measured
 * against arb1.arbitrum.io over 12 proposals, median of three runs:
 *
 * | calls                    | median |
 * | ------------------------ | ------ |
 * | state                    | 384ms  |
 * | state + proposalVotes    | 391ms  |
 * | + quorum                 | 502ms  |
 *
 * Votes are free at this size, so they ride along and stay fresher than the
 * governance indexer's copy, which trails its own watermark on exactly the
 * proposals being voted on right now. Quorum is not free: `quorum(snapshot)`
 * walks the token's checkpoints at a historical block, and it costs a fifth of
 * the wait for a number no status depends on. `QuorumCell` fetches it for the
 * rows that display it, once they scroll into view, and caches it for the
 * session.
 *
 * Falls back to the per-proposal reads if the multicall fails, so an RPC
 * without Multicall3 still refreshes, just slower.
 */
export async function refreshProposalStates(
  provider: ethers.providers.Provider,
  proposals: ParsedProposal[]
): Promise<ParsedProposal[]> {
  if (proposals.length === 0) return [];

  try {
    return await refreshViaMulticall(provider, proposals);
  } catch (error) {
    debug.search(
      "multicall refresh failed, falling back to per-proposal reads: %O",
      error
    );
    return refreshOneByOne(provider, proposals);
  }
}

/** The calls one proposal contributes to the batch, and where they landed */
interface ProposalCallSlots {
  proposal: ParsedProposal;
  state: number;
  votes: number;
}

async function refreshViaMulticall(
  provider: ethers.providers.Provider,
  proposals: ParsedProposal[]
): Promise<ParsedProposal[]> {
  const governorInterface = new ethers.utils.Interface(OZGovernor_ABI);

  const chunks: ParsedProposal[][] = [];
  for (let i = 0; i < proposals.length; i += MULTICALL_PROPOSAL_CHUNK) {
    chunks.push(proposals.slice(i, i + MULTICALL_PROPOSAL_CHUNK));
  }

  const refreshedChunks = await Promise.all(
    chunks.map(async (chunk) => {
      const calls: MulticallInput[] = [];
      const slots: ProposalCallSlots[] = [];

      for (const proposal of chunk) {
        const target = proposal.contractAddress;
        const slot: ProposalCallSlots = {
          proposal,
          state: calls.length,
          votes: calls.length + 1,
        };

        calls.push({
          target,
          allowFailure: true,
          callData: encodeCall(governorInterface, "state", [proposal.id]),
        });
        calls.push({
          target,
          allowFailure: true,
          callData: encodeCall(governorInterface, "proposalVotes", [
            proposal.id,
          ]),
        });

        slots.push(slot);
      }

      const results = await multicall(provider, calls);

      return slots.map((slot) =>
        applyRefreshResults(slot, results, governorInterface)
      );
    })
  );

  return refreshedChunks.flat();
}

/**
 * Fold one proposal's multicall results back into it, keeping whatever the
 * chain declined to answer as it was.
 */
function applyRefreshResults(
  { proposal, state, votes }: ProposalCallSlots,
  results: MulticallResult[],
  governorInterface: ethers.utils.Interface
): ParsedProposal {
  const stateResult = results[state];
  if (!stateResult?.success) return proposal;

  const refreshed: ParsedProposal = {
    ...proposal,
    state: getStateName(
      decodeResult<number>(governorInterface, "state", stateResult.returnData)
    ),
  };

  const votesResult = results[votes];
  if (!votesResult?.success) return refreshed;

  const decodedVotes = governorInterface.decodeFunctionResult(
    "proposalVotes",
    votesResult.returnData
  );

  return {
    ...refreshed,
    votes: {
      againstVotes: decodedVotes.againstVotes.toString(),
      forVotes: decodedVotes.forVotes.toString(),
      abstainVotes: decodedVotes.abstainVotes.toString(),
      // Left as it was: this refresh does not read quorum, and QuorumCell
      // fills it in for the rows that show it.
      quorum: proposal.votes?.quorum,
    },
  };
}

/** Pre-Multicall3 path: two round trips per proposal, five at a time. */
async function refreshOneByOne(
  provider: ethers.providers.Provider,
  proposals: ParsedProposal[]
): Promise<ParsedProposal[]> {
  const getContract = createContractCache(provider);

  const queries = proposals.map((proposal) => async () => {
    const contract = getContract(proposal.contractAddress);
    try {
      const stateData = await fetchProposalStateAndVotes(
        contract,
        proposal.id,
        proposal.startBlock
      );

      return {
        ...proposal,
        state: getStateName(stateData.state),
        votes: {
          ...stateData.votes,
          quorum: stateData.quorum,
        },
      };
    } catch {
      // If refresh fails, keep the cached version
      return proposal;
    }
  });

  return batchQueryWithRateLimit(queries, 5, 500);
}
