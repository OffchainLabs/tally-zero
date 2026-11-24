"use client";

import { readGetVotes } from "@gzeoneth/gov-tracker";
import { zeroAddress } from "viem";
import { useAccount, useReadContract } from "wagmi";

/**
 * The account's voting power at the proposal snapshot, as the proposal's own
 * governor counts it. An L2 governor returns the ARB token's past votes. The
 * L1 voting governor returns the proven votes of the L2 delegate the account
 * claimed, and reverts (so `votingPower` stays undefined) while the claim or
 * the votes are unproven.
 */
export function useProposalVotingPower({
  startBlock,
  governorAddress,
  chainId,
}: {
  startBlock: string | undefined;
  governorAddress: `0x${string}`;
  /** The governor's chain; the read ignores the wallet's chain */
  chainId: number;
}) {
  const { address, isConnected } = useAccount();
  const accountAddress = address ?? zeroAddress;
  const snapshotBlock = startBlock ? BigInt(startBlock) : undefined;
  const canReadAccountData = isConnected && !!address;

  const { data, isLoading } = useReadContract({
    ...readGetVotes(
      accountAddress,
      snapshotBlock ?? BigInt(0),
      governorAddress,
      chainId
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
