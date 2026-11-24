"use client";

import { readHasVoted } from "@gzeoneth/gov-tracker";
import { zeroAddress } from "viem";
import { useAccount, useReadContract } from "wagmi";

export function useProposalHasVoted({
  proposalId,
  governorAddress,
  chainId,
}: {
  proposalId: string;
  governorAddress: `0x${string}`;
  /** The governor's chain; the read ignores the wallet's chain */
  chainId: number;
}) {
  const { address, isConnected } = useAccount();
  const accountAddress = address ?? zeroAddress;
  const canReadAccountData = isConnected && !!address;

  const { data, isLoading } = useReadContract({
    ...readHasVoted(proposalId, accountAddress, governorAddress, chainId),
    query: {
      enabled: canReadAccountData,
    },
  });

  const hasVoted = data as boolean | undefined;

  return {
    hasVoted,
    hasRecordedVote: hasVoted === true,
    isLoadingHasVoted: isLoading,
  };
}
