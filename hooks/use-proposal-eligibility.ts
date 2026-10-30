"use client";

import { readVotingPower } from "@gzeoneth/gov-tracker";
import { keepPreviousData } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { zeroAddress, type Abi } from "viem";
import { useAccount, useReadContract } from "wagmi";

import { ARB_TOKEN, ARBITRUM_CHAIN_ID } from "@/config/arbitrum-governance";
import { GOVERNORS, type L2GovernorType } from "@/config/governors";
import { useGovernanceClock } from "@/hooks/use-governance-clock";
import {
  getProposalEligibility,
  getProposalSnapshotBlock,
  type ProposalEligibility,
} from "@/lib/create-proposal-form-utils";
import OzGovernorABI from "@data/OzGovernor_ABI.json";

const OZ_GOVERNOR_ABI = OzGovernorABI as Abi;

export type ProposalEligibilityResult = {
  /** Whether the measured address clears the governor's proposal threshold. */
  eligibility: ProposalEligibility;
  /** The address's voting power at the snapshot block, once read. */
  votingPower: bigint | undefined;
  /** The governor's `proposalThreshold()`, once read. */
  proposalThreshold: bigint | undefined;
  /** The block voting power is measured at (the governance clock, less a lookback). */
  snapshotBlock: bigint | undefined;
  /** True while either read is still pending its first value. */
  isLoading: boolean;
  /**
   * True when either read has failed and has no value to show, so "unknown"
   * means "could not tell" rather than "not yet". Only a refetch (or a query
   * remount) clears it: the threshold read has no refetch interval.
   */
  isError: boolean;
  /** Retries whichever read(s) failed. */
  refetch: () => Promise<void>;
};

export type ProposalEligibilityOptions = {
  /**
   * The address to measure instead of the connected wallet. The drafts dialog
   * and list pass the SIWE subject (`actingAs ?? address`, see
   * lib/siwe/client.ts) because drafts belong to it; null and undefined fall
   * back to the wallet.
   */
  address?: string | null;
};

/**
 * Can this address propose to this governor? Shared by the proposal form
 * (submit gate), the save-to-drafts dialog, and the drafts list, so one
 * reading decides all three.
 *
 * Which address depends on what is gated. The form's submit button measures
 * the connected wallet, since that is what signs `propose` and what the
 * governor checks. Saving and publishing a draft are gated on the SIWE
 * subject the draft belongs to (the Safe when acting as one), so those callers
 * pass it in. The indexer enforces no threshold on drafts today; this hook is
 * the only gate.
 *
 * The voting-power read is keyed by the snapshot block and keeps the previous
 * value while a new block's read is in flight, so the figure does not blank
 * out on every governance clock refresh.
 */
export function useProposalEligibility(
  governorType: L2GovernorType,
  options?: ProposalEligibilityOptions
): ProposalEligibilityResult {
  const { address: walletAddress, isConnected } = useAccount();
  const address = (options?.address ?? walletAddress) as
    | `0x${string}`
    | undefined;
  const governor = GOVERNORS[governorType];

  const { clockBlock } = useGovernanceClock();
  const snapshotBlock = useMemo(
    () => getProposalSnapshotBlock(clockBlock),
    [clockBlock]
  );

  const {
    data: rawVotingPower,
    isLoading: isLoadingVotingPower,
    isError: isVotingPowerError,
    refetch: refetchVotingPower,
  } = useReadContract({
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

  const {
    data: rawThreshold,
    isLoading: isLoadingThreshold,
    isError: isThresholdError,
    refetch: refetchThreshold,
  } = useReadContract({
    address: governor.address as `0x${string}`,
    abi: OZ_GOVERNOR_ABI,
    functionName: "proposalThreshold",
    chainId: ARBITRUM_CHAIN_ID,
  });
  const proposalThreshold = rawThreshold as bigint | undefined;

  const votingPowerFailed =
    Boolean(isVotingPowerError) && votingPower === undefined;
  const thresholdFailed =
    Boolean(isThresholdError) && proposalThreshold === undefined;

  const refetch = useCallback(async () => {
    await Promise.all([
      votingPowerFailed ? refetchVotingPower() : undefined,
      thresholdFailed ? refetchThreshold() : undefined,
    ]);
  }, [
    votingPowerFailed,
    thresholdFailed,
    refetchVotingPower,
    refetchThreshold,
  ]);

  return {
    eligibility: getProposalEligibility(votingPower, proposalThreshold),
    votingPower,
    proposalThreshold,
    snapshotBlock,
    isLoading: isLoadingVotingPower || isLoadingThreshold,
    isError: votingPowerFailed || thresholdFailed,
    refetch,
  };
}
