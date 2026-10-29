"use client";

import { readVotingPower } from "@gzeoneth/gov-tracker";
import { keepPreviousData } from "@tanstack/react-query";
import { useMemo } from "react";
import { zeroAddress, type Abi } from "viem";
import { useAccount, useReadContract } from "wagmi";

import { ARB_TOKEN, ARBITRUM_CHAIN_ID } from "@/config/arbitrum-governance";
import { GOVERNORS, type GovernorType } from "@/config/governors";
import { useGovernanceClock } from "@/hooks/use-governance-clock";
import {
  getProposalEligibility,
  getProposalSnapshotBlock,
  type ProposalEligibility,
} from "@/lib/create-proposal-form-utils";
import OzGovernorABI from "@data/OzGovernor_ABI.json";

const OZ_GOVERNOR_ABI = OzGovernorABI as Abi;

export type ProposalEligibilityResult = {
  /** Whether the connected wallet clears the governor's proposal threshold. */
  eligibility: ProposalEligibility;
  /** The wallet's voting power at the snapshot block, once read. */
  votingPower: bigint | undefined;
  /** The governor's `proposalThreshold()`, once read. */
  proposalThreshold: bigint | undefined;
  /** The block voting power is measured at (the governance clock, less a lookback). */
  snapshotBlock: bigint | undefined;
  /** True while either read is still pending its first value. */
  isLoading: boolean;
};

/**
 * Can the connected wallet propose to this governor? Shared by the proposal
 * form (submit gate), the save-to-drafts dialog, and the drafts list, so one
 * reading decides all three.
 *
 * Measures the connected wallet rather than the SIWE acting-as subject: the
 * wallet is what signs `propose`, so its voting power is what the governor
 * checks. The voting-power read is keyed by the snapshot block and keeps the
 * previous value while a new block's read is in flight, so the figure does not
 * blank out on every governance clock refresh.
 */
export function useProposalEligibility(
  governorType: GovernorType
): ProposalEligibilityResult {
  const { address, isConnected } = useAccount();
  const governor = GOVERNORS[governorType];

  const { clockBlock } = useGovernanceClock();
  const snapshotBlock = useMemo(
    () => getProposalSnapshotBlock(clockBlock),
    [clockBlock]
  );

  const { data: rawVotingPower, isLoading: isLoadingVotingPower } =
    useReadContract({
      ...readVotingPower(
        address ?? zeroAddress,
        snapshotBlock ?? BigInt(0),
        ARB_TOKEN.address
      ),
      query: {
        enabled: isConnected && !!address && snapshotBlock !== undefined,
        placeholderData: keepPreviousData,
      },
    });
  const votingPower = rawVotingPower as bigint | undefined;

  const { data: rawThreshold, isLoading: isLoadingThreshold } = useReadContract(
    {
      address: governor.address as `0x${string}`,
      abi: OZ_GOVERNOR_ABI,
      functionName: "proposalThreshold",
      chainId: ARBITRUM_CHAIN_ID,
    }
  );
  const proposalThreshold = rawThreshold as bigint | undefined;

  return {
    eligibility: getProposalEligibility(votingPower, proposalThreshold),
    votingPower,
    proposalThreshold,
    snapshotBlock,
    isLoading: isLoadingVotingPower || isLoadingThreshold,
  };
}
