"use client";

/**
 * Hook for fetching a single proposal by ID
 * Searches all governors and used for deep linking
 */

import { queryProposalCreatedEvents } from "@gzeoneth/gov-tracker";
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
            const matchingEvent = creationEvents.find(
              (event) => event.proposalId === proposalId
            );

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
