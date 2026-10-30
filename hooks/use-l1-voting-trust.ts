"use client";

import {
  decodeActions,
  type DecodedCall,
  type VerifiedProposal,
  verifyProposal,
} from "@offchainlabs/l1-voting-proving";
import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";

import { l1VotingChainId } from "@/config/chains";
import { loadDeployment, type PinnedDeployment } from "@/lib/l1-voting/trust";

/** The L1 voting deployment every transaction is checked against (see lib/l1-voting/trust.ts). */
export function useL1VotingDeployment() {
  const chainId = l1VotingChainId();
  const l1 = usePublicClient({ chainId });
  return useQuery({
    queryKey: ["l1-voting", "pinned-deployment", chainId],
    queryFn: () => loadDeployment(l1!, chainId),
    enabled: !!l1,
    staleTime: Infinity,
  });
}

export interface ProposalVerification {
  proposal: VerifiedProposal;
  actions: DecodedCall[];
}

/**
 * The proposal's content as Ethereum records it, through the user's own L1 RPC, checked against
 * the proposal id. Independent of the indexer, which only shows it.
 */
export function useVerifiedProposal(
  proposalId: string,
  deployment: PinnedDeployment | null | undefined
) {
  const chainId = l1VotingChainId();
  const l1 = usePublicClient({ chainId });
  return useQuery({
    queryKey: ["l1-voting", "verified-proposal", chainId, proposalId],
    queryFn: async (): Promise<ProposalVerification> => {
      const proposal = await verifyProposal(
        l1!,
        deployment!,
        BigInt(proposalId)
      );
      return { proposal, actions: decodeActions(proposal) };
    },
    enabled: !!l1 && !!deployment,
    staleTime: Infinity,
    retry: 2,
  });
}
