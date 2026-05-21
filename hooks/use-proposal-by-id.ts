"use client";

/**
 * Hook for fetching a single proposal by ID
 * Searches all governors and used for deep linking
 */

import {
  queryProposalCreatedEvents,
  type ProposalData,
} from "@gzeoneth/gov-tracker";
import { ethers } from "ethers";
import { useCallback, useEffect, useState } from "react";

import {
  ARBITRUM_CHAIN_ID,
  ARBITRUM_GOVERNORS,
} from "@/config/arbitrum-governance";
import { useRpcSettings } from "@/hooks/use-rpc-settings";
import { createRpcProvider } from "@/lib/rpc-utils";
import { getStateName } from "@/lib/state-utils";
import { formatVotes } from "@/lib/vote-utils";
import type { ParsedProposal } from "@/types/proposal";
import OZGovernor_ABI from "@data/OzGovernor_ABI.json";

// Arbitrum governors report proposalSnapshot/proposalDeadline as L1 Ethereum
// block numbers (voting is based on ARB token snapshots at L1 blocks), but the
// governor contract and its ProposalCreated events live on L2 Arbitrum. Search
// a recent L2 block window instead of the L1 snapshot block.
const L2_CREATION_SEARCH_WINDOW_BLOCKS = 10_000_000;

const PROPOSAL_CREATION_TX_HASHES_BY_CHAIN_ID: Record<
  number,
  Record<string, string>
> = {
  [ARBITRUM_CHAIN_ID]: {
    "86654545843645364200491220873325841239317939837732580673532485559601859962180":
      "0x0424b564ec9b6e181b618da10f42f304263e858498ec7b0521a74d10d9843b6b",
    "71236395575275509514809232906539225896862899916501711888027988560774655719183":
      "0x5d76ab672426aafeeb88bb67212388d3425598bf06ff490aed9b7550d72bd00c",
  },
};

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
}): Promise<ProposalData | null> {
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
      if (parsed.args.proposalId.toString() !== proposalId) continue;

      return {
        proposalId,
        proposer: parsed.args.proposer,
        targets: parsed.args.targets,
        values: parsed.args[3],
        signatures: parsed.args.signatures,
        calldatas: parsed.args.calldatas,
        startBlock: parsed.args.startBlock,
        endBlock: parsed.args.endBlock,
        description: parsed.args.description,
        creationBlock: log.blockNumber,
        creationTxHash: log.transactionHash,
      };
    } catch {
      // Ignore unrelated governor logs in the same transaction receipt.
    }
  }

  return null;
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

        const governorsToSearch = governorAddress
          ? ARBITRUM_GOVERNORS.filter(
              (governor) =>
                governor.address.toLowerCase() === governorAddress.toLowerCase()
            )
          : ARBITRUM_GOVERNORS;

        // Try each governor until we find the proposal
        for (const governor of governorsToSearch) {
          if (cancelled) return;

          try {
            const contract = new ethers.Contract(
              governor.address,
              OZGovernor_ABI,
              provider
            );

            // Try to get the proposal state - this will throw if it doesn't exist
            const proposalState = await contract.state(proposalId);

            // If we get here, the proposal exists in this governor
            const [votes, proposalSnapshot, proposalDeadline] =
              await Promise.all([
                contract.proposalVotes(proposalId),
                contract.proposalSnapshot(proposalId),
                contract.proposalDeadline(proposalId),
              ]);

            const snapshotBlock = proposalSnapshot.toNumber();
            const knownCreationTxHash = getKnownProposalCreationTxHash(
              ARBITRUM_CHAIN_ID,
              proposalId
            );
            let matchingEvent = knownCreationTxHash
              ? await findProposalCreatedEventByTxHash({
                  provider,
                  contract,
                  governorAddress: governor.address,
                  proposalId,
                  txHash: knownCreationTxHash,
                })
              : null;

            if (!matchingEvent) {
              const currentL2Block = await provider.getBlockNumber();
              const searchFromBlock = Math.max(
                currentL2Block - L2_CREATION_SEARCH_WINDOW_BLOCKS,
                0
              );
              const creationEvents = await queryProposalCreatedEvents(
                provider,
                governor.address,
                searchFromBlock,
                currentL2Block
              );
              matchingEvent =
                creationEvents.find(
                  (event) => event.proposalId === proposalId
                ) ?? null;
            }

            if (!matchingEvent) {
              // Proposal exists but we couldn't find the creation event
              // Create a minimal proposal object
              let quorum: string | undefined;
              try {
                const quorumBN = await contract.quorum(snapshotBlock);
                quorum = quorumBN.toString();
              } catch {
                // Quorum fetch can fail
              }

              const parsedProposal: ParsedProposal = {
                id: proposalId,
                contractAddress: governor.address,
                proposer: "Unknown",
                targets: [],
                values: [],
                signatures: [],
                calldatas: [],
                startBlock: snapshotBlock.toString(),
                endBlock: proposalDeadline.toString(),
                description: `Proposal ${proposalId}`,
                networkId: String(ARBITRUM_CHAIN_ID),
                state: getStateName(proposalState),
                governorName: governor.name,
                votes: formatVotes(votes, quorum),
              };

              if (!cancelled) {
                setProposal(parsedProposal);
                setIsLoading(false);
              }
              return;
            }

            let quorum: string | undefined;
            try {
              const quorumBN = await contract.quorum(matchingEvent.startBlock);
              quorum = quorumBN.toString();
            } catch {
              // Quorum fetch can fail
            }

            const parsedProposal: ParsedProposal = {
              id: proposalId,
              contractAddress: governor.address,
              proposer: matchingEvent.proposer,
              targets: matchingEvent.targets,
              values: matchingEvent.values.map((v) => v.toString()),
              signatures: matchingEvent.signatures,
              calldatas: matchingEvent.calldatas,
              startBlock: matchingEvent.startBlock.toString(),
              endBlock: matchingEvent.endBlock.toString(),
              description: matchingEvent.description,
              networkId: String(ARBITRUM_CHAIN_ID),
              state: getStateName(proposalState),
              governorName: governor.name,
              creationTxHash: matchingEvent.creationTxHash,
              votes: formatVotes(votes, quorum),
            };

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
