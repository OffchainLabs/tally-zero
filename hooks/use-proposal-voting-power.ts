"use client";

import { readVotingPower } from "@gzeoneth/gov-tracker";
import { zeroAddress } from "viem";
import { useAccount, useReadContract } from "wagmi";

import { ARB_TOKEN } from "@/config/arbitrum-governance";

export function useProposalVotingPower({
  startBlock,
}: {
  startBlock: string | undefined;
}) {
  const { address, isConnected } = useAccount();
  const accountAddress = address ?? zeroAddress;
  const snapshotBlock = startBlock ? BigInt(startBlock) : undefined;
  const canReadAccountData = isConnected && !!address;

  const { data, isLoading } = useReadContract({
    ...readVotingPower(
      accountAddress,
      snapshotBlock ?? BigInt(0),
      ARB_TOKEN.address
    ),
    query: {
      enabled: canReadAccountData && snapshotBlock !== undefined,
    },
  });

  return {
    votingPower: data as bigint | undefined,
    isLoadingVotingPower: isLoading,
  };
}
