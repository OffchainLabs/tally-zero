"use client";

import { useMemo } from "react";
import { useAccount, useReadContract } from "wagmi";

import { readVotingPower } from "@gzeoneth/gov-tracker";

import { useElectionContracts } from "@/hooks/use-election-contracts";

interface UseElectionVotingPowerOptions {
  proposalId: string;
  governorAddress: `0x${string}`;
  governorReadAbi: readonly Record<string, unknown>[];
}

interface UseElectionVotingPowerResult {
  totalVotingPower: bigint | undefined;
  usedVotes: bigint | undefined;
  availableVotes: bigint | undefined;
  refetchUsedVotes: () => void;
}

export function useElectionVotingPower({
  proposalId,
  governorAddress,
  governorReadAbi,
}: UseElectionVotingPowerOptions): UseElectionVotingPowerResult {
  const { address, isConnected } = useAccount();
  const { tokenAddress } = useElectionContracts();

  const { data: snapshotBlock } = useReadContract({
    address: governorAddress,
    abi: governorReadAbi,
    functionName: "proposalSnapshot",
    args: [BigInt(proposalId)],
  });

  const { data: totalVotingPower } = useReadContract({
    ...readVotingPower(
      address ?? "0x0000000000000000000000000000000000000000",
      (snapshotBlock as bigint) ?? BigInt(0),
      tokenAddress
    ),
    query: { enabled: isConnected && !!address && !!snapshotBlock },
  });

  const { data: usedVotes, refetch: refetchUsedVotes } = useReadContract({
    address: governorAddress,
    abi: governorReadAbi,
    functionName: "votesUsed",
    args: address ? [BigInt(proposalId), address] : undefined,
    query: { enabled: isConnected && !!address },
  });

  const availableVotes = useMemo(() => {
    if (totalVotingPower === undefined || usedVotes === undefined)
      return undefined;
    const total = totalVotingPower as bigint;
    const used = usedVotes as bigint;
    const avail = total - used;
    return avail > BigInt(0) ? avail : BigInt(0);
  }, [totalVotingPower, usedVotes]);

  return {
    totalVotingPower: totalVotingPower as bigint | undefined,
    usedVotes: usedVotes as bigint | undefined,
    availableVotes,
    refetchUsedVotes,
  };
}
