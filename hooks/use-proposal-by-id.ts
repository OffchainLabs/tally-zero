"use client";

/**
 * Hook for fetching a single proposal by ID
 * Searches all governors and used for deep linking
 */

import { ethers } from "ethers";
import { useCallback, useEffect, useState } from "react";

import {
  ARBITRUM_CHAIN_ID,
  ARBITRUM_GOVERNORS,
} from "@/config/arbitrum-governance";
import { useRpcSettings } from "@/hooks/use-rpc-settings";
import { getBundledProposalCreationTxHash } from "@/lib/bundled-cache-loader";
import { getProposalIndexEntry } from "@/lib/delegate-cache";
import {
  proposalCreatedEventDataFromArgs,
  queryProposalCreatedEventsUntruncated,
  type ProposalCreatedEventData,
} from "@/lib/proposal-created-event";
import { createRpcProvider } from "@/lib/rpc-utils";
import { getStateName } from "@/lib/state-utils";
import type { TallyProposalIndexEntry } from "@/lib/tally-data/types";
import { formatVotes, type RawVotes } from "@/lib/vote-utils";
import type { ParsedProposal } from "@/types/proposal";
import OZGovernor_ABI from "@data/OzGovernor_ABI.json";

// Arbitrum governors report proposalSnapshot/proposalDeadline as L1 Ethereum
// block numbers (voting is based on ARB token snapshots at L1 blocks), but the
// governor contract and its ProposalCreated events live on L2 Arbitrum. Search
// a recent L2 block window to cover proposals that are not yet in the
// hardcoded list or the bundled gov-tracker cache.
const L2_CREATION_SEARCH_WINDOW_BLOCKS = 10_000_000;

// Proposals that the bundled gov-tracker cache does not yet cover. The hash
// here lets us skip log scanning and parse the ProposalCreated event straight
// from the transaction receipt.
const PROPOSAL_CREATION_TX_HASHES_BY_CHAIN_ID: Record<
  number,
  Record<string, string>
> = {
  [ARBITRUM_CHAIN_ID]: {
    "86654545843645364200491220873325841239317939837732580673532485559601859962180":
      "0x0424b564ec9b6e181b618da10f42f304263e858498ec7b0521a74d10d9843b6b",
    "71236395575275509514809232906539225896862899916501711888027988560774655719183":
      "0x5d76ab672426aafeeb88bb67212388d3425598bf06ff490aed9b7550d72bd00c",
    "21861170607500194610699142421898826942478361357343425061227227766726035674989":
      "0xa12f865055b2c9dcb0b5ecc0cea61fd9f246bc5555e9e198a529ecabe9c603fb",
    // Constitutional AIP: ArbOS61 Elara Upgrade. Created at L2 block
    // 483,508,532, which left the log-scan window around 2026-08-11.
    "7191014407719621170610709569285477750369874509305441081488686529382763374426":
      "0xb354f3f34e2bb93fe006c43f52672da7167db1ed4faf0bdab3804e846d9cf44b",
  },
};

/** Proposer shown when no metadata source knows the real one */
const UNKNOWN_PROPOSER = "Unknown";

/** Options for configuring proposal lookup */
interface UseProposalByIdOptions {
  /** The proposal ID to fetch */
  proposalId: string | null;
  /** Governor contract address to search, if known */
  governorAddress?: string | null;
  /** Whether lookup is enabled */
  enabled?: boolean;
  /** Custom RPC URL to use */
  customRpcUrl?: string;
}

/** Return type for useProposalById hook */
interface UseProposalByIdResult {
  /** Fetched proposal or null */
  proposal: ParsedProposal | null;
  /** Whether fetch is in progress */
  isLoading: boolean;
  /** Error if fetch failed */
  error: Error | null;
  /** Function to manually refetch */
  refetch: () => void;
}

type ArbitrumGovernor = (typeof ARBITRUM_GOVERNORS)[number];

interface ProposalContractData {
  proposalState: number;
  votes: RawVotes;
  snapshotBlock: number;
  proposalDeadline: ethers.BigNumber;
}

interface BuildProposalBaseOptions {
  governor: ArbitrumGovernor;
  proposalId: string;
  proposalState: number;
  votes: RawVotes;
}

function getKnownProposalCreationTxHash(
  chainId: number,
  proposalId: string
): string | undefined {
  return PROPOSAL_CREATION_TX_HASHES_BY_CHAIN_ID[chainId]?.[proposalId];
}

async function findProposalCreatedEventByTxHash({
  provider,
  contract,
  governorAddress,
  proposalId,
  txHash,
}: {
  provider: ethers.providers.Provider;
  contract: ethers.Contract;
  governorAddress: string;
  proposalId: string;
  txHash: string;
}): Promise<ProposalCreatedEventData | null> {
  const receipt = await provider.getTransactionReceipt(txHash);
  if (!receipt) return null;

  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== governorAddress.toLowerCase()) continue;

    try {
      const parsed = contract.interface.parseLog({
        topics: log.topics as string[],
        data: log.data,
      });

      if (parsed.name !== "ProposalCreated") continue;

      const data = proposalCreatedEventDataFromArgs({
        args: parsed.args,
        blockNumber: log.blockNumber,
        transactionHash: log.transactionHash,
      });
      if (!data) continue;
      if (data.proposalId !== proposalId) continue;

      return data;
    } catch {
      // Ignore unrelated governor logs in the same transaction receipt.
    }
  }

  return null;
}

async function resolveCreationTxHash({
  proposalId,
  governorAddress,
}: {
  proposalId: string;
  governorAddress: string;
}): Promise<string | null> {
  const hardcoded = getKnownProposalCreationTxHash(
    ARBITRUM_CHAIN_ID,
    proposalId
  );
  if (hardcoded) return hardcoded;

  return getBundledProposalCreationTxHash({ proposalId, governorAddress });
}

async function findProposalCreatedEventByLogScan({
  provider,
  contract,
  proposalId,
}: {
  provider: ethers.providers.Provider;
  contract: ethers.Contract;
  proposalId: string;
}): Promise<ProposalCreatedEventData | null> {
  const currentL2Block = await provider.getBlockNumber();
  const searchFromBlock = Math.max(
    currentL2Block - L2_CREATION_SEARCH_WINDOW_BLOCKS,
    0
  );
  const creationEvents = await queryProposalCreatedEventsUntruncated({
    contract,
    fromBlock: searchFromBlock,
    toBlock: currentL2Block,
  });

  return (
    creationEvents.find((event) => event.proposalId === proposalId) ?? null
  );
}

async function findProposalCreatedEvent({
  provider,
  contract,
  governorAddress,
  proposalId,
}: {
  provider: ethers.providers.Provider;
  contract: ethers.Contract;
  governorAddress: string;
  proposalId: string;
}): Promise<ProposalCreatedEventData | null> {
  const creationTxHash = await resolveCreationTxHash({
    proposalId,
    governorAddress,
  });

  if (creationTxHash) {
    const fromReceipt = await findProposalCreatedEventByTxHash({
      provider,
      contract,
      governorAddress,
      proposalId,
      txHash: creationTxHash,
    });
    if (fromReceipt) return fromReceipt;
  }

  // Last resort: scan the recent L2 block window for proposals that aren't
  // in the hardcoded list or the bundled cache yet (e.g. freshly created).
  return findProposalCreatedEventByLogScan({
    provider,
    contract,
    proposalId,
  });
}

async function fetchProposalContractData(
  contract: ethers.Contract,
  proposalId: string
): Promise<ProposalContractData> {
  const proposalState = await contract.state(proposalId);
  const [votes, proposalSnapshot, proposalDeadline] = await Promise.all([
    contract.proposalVotes(proposalId),
    contract.proposalSnapshot(proposalId),
    contract.proposalDeadline(proposalId),
  ]);

  return {
    proposalState,
    votes,
    snapshotBlock: proposalSnapshot.toNumber(),
    proposalDeadline,
  };
}

async function fetchQuorum(
  contract: ethers.Contract,
  blockNumber: number | ethers.BigNumber
): Promise<string | undefined> {
  try {
    const quorumBN = await contract.quorum(blockNumber);
    return quorumBN.toString();
  } catch {
    return undefined;
  }
}

/**
 * Proposal metadata that the governor contract does not expose.
 *
 * The `ProposalCreated` event is the richest source and the only one carrying the
 * payload, but it is reachable only while the creation tx hash is known or the
 * creation block is still inside {@link L2_CREATION_SEARCH_WINDOW_BLOCKS}. When
 * it is not, the governance indexer still has the proposer and the full
 * description, which is what the page header and description tab need.
 */
export interface ProposalMetadataFallback {
  proposer: string;
  description: string;
}

/**
 * Pick the best available proposer and description for a proposal whose
 * `ProposalCreated` event could not be found.
 *
 * @param proposalId - Used to build the placeholder description
 * @param indexEntry - Governance indexer row, or null when unavailable
 */
export function resolveProposalMetadataFallback({
  proposalId,
  indexEntry,
}: {
  proposalId: string;
  indexEntry: TallyProposalIndexEntry | null;
}): ProposalMetadataFallback {
  return {
    proposer: indexEntry?.proposer || UNKNOWN_PROPOSER,
    description: indexEntry?.description || `Proposal ${proposalId}`,
  };
}

/**
 * Read a proposal's indexer row, tolerating failure.
 *
 * Returns null on any error so an indexer outage, or an unconfigured
 * `GOVERNANCE_INDEXER_URL` (the proxy answers 503), degrades to placeholder
 * metadata instead of failing the whole proposal fetch.
 */
async function fetchProposalIndexEntry({
  proposalId,
  governorAddress,
}: {
  proposalId: string;
  governorAddress: string;
}): Promise<TallyProposalIndexEntry | null> {
  try {
    return await getProposalIndexEntry(proposalId, governorAddress);
  } catch {
    return null;
  }
}

function buildMinimalProposal({
  governor,
  proposalId,
  proposalState,
  votes,
  snapshotBlock,
  proposalDeadline,
  quorum,
  metadata,
}: BuildProposalBaseOptions & {
  snapshotBlock: number;
  proposalDeadline: ethers.BigNumber;
  quorum: string | undefined;
  metadata: ProposalMetadataFallback;
}): ParsedProposal {
  return {
    id: proposalId,
    contractAddress: governor.address,
    proposer: metadata.proposer,
    targets: [],
    values: [],
    signatures: [],
    calldatas: [],
    startBlock: snapshotBlock.toString(),
    endBlock: proposalDeadline.toString(),
    description: metadata.description,
    networkId: String(ARBITRUM_CHAIN_ID),
    state: getStateName(proposalState),
    governorName: governor.name,
    votes: formatVotes(votes, quorum),
  };
}

function buildProposalFromEvent({
  governor,
  proposalId,
  proposalState,
  votes,
  creationEvent,
  quorum,
}: BuildProposalBaseOptions & {
  creationEvent: ProposalCreatedEventData;
  quorum: string | undefined;
}): ParsedProposal {
  return {
    id: proposalId,
    contractAddress: governor.address,
    proposer: creationEvent.proposer,
    targets: creationEvent.targets,
    values: creationEvent.values.map((v) => v.toString()),
    signatures: creationEvent.signatures,
    calldatas: creationEvent.calldatas,
    startBlock: creationEvent.startBlock.toString(),
    endBlock: creationEvent.endBlock.toString(),
    description: creationEvent.description,
    networkId: String(ARBITRUM_CHAIN_ID),
    state: getStateName(proposalState),
    governorName: governor.name,
    creationTxHash: creationEvent.creationTxHash,
    votes: formatVotes(votes, quorum),
  };
}

async function fetchProposalFromGovernor({
  provider,
  governor,
  proposalId,
}: {
  provider: ethers.providers.Provider;
  governor: ArbitrumGovernor;
  proposalId: string;
}): Promise<ParsedProposal> {
  const contract = new ethers.Contract(
    governor.address,
    OZGovernor_ABI,
    provider
  );
  const { proposalState, votes, snapshotBlock, proposalDeadline } =
    await fetchProposalContractData(contract, proposalId);
  const creationEvent = await findProposalCreatedEvent({
    provider,
    contract,
    governorAddress: governor.address,
    proposalId,
  });

  if (!creationEvent) {
    // Neither call depends on the other, and the indexer is the only source
    // left for the proposer and description.
    const [quorum, indexEntry] = await Promise.all([
      fetchQuorum(contract, snapshotBlock),
      fetchProposalIndexEntry({
        proposalId,
        governorAddress: governor.address,
      }),
    ]);

    return buildMinimalProposal({
      governor,
      proposalId,
      proposalState,
      votes,
      snapshotBlock,
      proposalDeadline,
      quorum,
      metadata: resolveProposalMetadataFallback({ proposalId, indexEntry }),
    });
  }

  const quorum = await fetchQuorum(contract, creationEvent.startBlock);
  return buildProposalFromEvent({
    governor,
    proposalId,
    proposalState,
    votes,
    creationEvent,
    quorum,
  });
}

function getGovernorsToSearch(
  governorAddress: string | null | undefined
): readonly ArbitrumGovernor[] {
  if (!governorAddress) return ARBITRUM_GOVERNORS;

  const normalizedAddress = governorAddress.toLowerCase();
  return ARBITRUM_GOVERNORS.filter(
    (governor) => governor.address.toLowerCase() === normalizedAddress
  );
}

/**
 * Hook to fetch a single proposal by ID from all governors
 * Used for deep linking when the proposal isn't in the cached/searched results
 * @param options - Fetch options including proposal ID and RPC URL
 * @returns Proposal, loading state, error, and refetch function
 */
export function useProposalById({
  proposalId,
  governorAddress,
  enabled = true,
  customRpcUrl,
}: UseProposalByIdOptions): UseProposalByIdResult {
  const { l2Rpc, isHydrated } = useRpcSettings({ customL2Rpc: customRpcUrl });

  const [proposal, setProposal] = useState<ParsedProposal | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [fetchTrigger, setFetchTrigger] = useState(0);

  const refetch = useCallback(() => {
    setFetchTrigger((t) => t + 1);
  }, []);

  useEffect(() => {
    if (!isHydrated) return;
    if (!enabled || !proposalId) {
      /* eslint-disable react-hooks/set-state-in-effect -- reset on param change */
      setProposal(null);
      setError(null);
      /* eslint-enable react-hooks/set-state-in-effect */
      return;
    }

    let cancelled = false;

    const fetchProposal = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const provider = await createRpcProvider(l2Rpc);

        const governorsToSearch = getGovernorsToSearch(governorAddress);

        // Try each governor until we find the proposal
        for (const governor of governorsToSearch) {
          if (cancelled) return;

          try {
            const parsedProposal = await fetchProposalFromGovernor({
              provider,
              governor,
              proposalId,
            });

            if (!cancelled) {
              setProposal(parsedProposal);
              setIsLoading(false);
            }
            return;
          } catch {
            // Proposal doesn't exist in this governor, try the next one
            continue;
          }
        }

        // Proposal not found in any governor
        if (!cancelled) {
          setError(
            new Error(`Proposal ${proposalId} not found in any governor`)
          );
          setIsLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err as Error);
          setIsLoading(false);
        }
      }
    };

    fetchProposal();

    return () => {
      cancelled = true;
    };
  }, [isHydrated, proposalId, governorAddress, enabled, l2Rpc, fetchTrigger]);

  return {
    proposal,
    isLoading,
    error,
    refetch,
  };
}
