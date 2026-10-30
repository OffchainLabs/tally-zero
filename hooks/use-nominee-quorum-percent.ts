"use client";

import type { Abi } from "viem";
import { useReadContracts } from "wagmi";

import { formatQuorumPercent } from "@/config/security-council";
import { useElectionContracts } from "./use-election-contracts";

/**
 * Not in the gov-tracker read ABIs: the nominee governor inherits these from
 * OpenZeppelin's `GovernorVotesQuorumFraction`.
 */
const QUORUM_FRACTION_ABI = [
  {
    type: "function",
    name: "quorumNumerator",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "quorumDenominator",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const satisfies Abi;

/**
 * The share of votable ARB a contender must be pledged to qualify as a
 * nominee, as a display label like "0.1%".
 *
 * Read from the nominee governor rather than hardcoded: the DAO changes it
 * with `updateQuorumNumerator`, most recently from 0.2% to 0.1% in the
 * "Security Council Election Process Improvements" AIP. Falls back to the
 * configured percentage while the reads are in flight or failing.
 */
export function useNomineeQuorumPercentLabel(): string {
  const { nomineeGovernorAddress, chainId } = useElectionContracts();

  const { data } = useReadContracts({
    contracts: [
      {
        address: nomineeGovernorAddress,
        abi: QUORUM_FRACTION_ABI,
        functionName: "quorumNumerator",
        chainId,
      },
      {
        address: nomineeGovernorAddress,
        abi: QUORUM_FRACTION_ABI,
        functionName: "quorumDenominator",
        chainId,
      },
    ],
    query: { staleTime: Infinity },
  });

  const numerator =
    data?.[0]?.status === "success" ? data[0].result : undefined;
  const denominator =
    data?.[1]?.status === "success" ? data[1].result : undefined;

  return formatQuorumPercent(numerator, denominator);
}
