import { ethers } from "ethers";

import { findByAddress } from "@/lib/address-utils";
import { debug } from "@/lib/debug";
import { batchQueryWithRateLimit } from "@/lib/rpc-utils";
import { getStateName } from "@/lib/state-utils";
import type { ParsedProposal, Proposal } from "@/types/proposal";
import {
  ARBITRUM_CHAIN_ID,
  ARBITRUM_GOVERNORS,
  BLOCKS_PER_DAY,
} from "@config/arbitrum-governance";
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
      const args = event.args!;
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
 * Refresh state and votes for existing proposals.
 * Batches RPC calls to reduce rate limiting issues.
 */
export async function refreshProposalStates(
  provider: ethers.providers.Provider,
  proposals: ParsedProposal[]
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

  // Execute in batches of 5 with 500ms delay to avoid rate limits
  return batchQueryWithRateLimit(queries, 5, 500);
}
