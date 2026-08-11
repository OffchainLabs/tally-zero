"use client";

import { arbitrum } from "viem/chains";
import { useReadContract } from "wagmi";

import { ARBITRUM_CHAIN_ID } from "@/config/arbitrum-governance";

/**
 * How often the clock is refreshed. Arbitrum One advances `block.number` in
 * step with L1 (~12s), so a short interval keeps derived reads (voting power,
 * quorum) close to live without hammering the RPC.
 */
const GOVERNANCE_CLOCK_REFRESH_INTERVAL_MS = 15_000;

/**
 * Multicall3 exposes `block.number` as a plain view function.
 *
 * We read the clock through a contract call rather than the Nitro-specific
 * `l1BlockNumber` field of `eth_getBlockByNumber`, because some providers
 * (dRPC, for one) strip that field from the block response, and users can
 * point the app at any RPC from Settings.
 */
const MULTICALL3_BLOCK_NUMBER_ABI = [
  {
    type: "function",
    name: "getBlockNumber",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
] as const;

interface UseGovernanceClockResult {
  /** `block.number` as Arbitrum One currently reports it, or null while loading. */
  clockBlock: bigint | null;
  isLoading: boolean;
}

/**
 * Hook for the block number Arbitrum governance checkpoints against.
 *
 * On Arbitrum One, `block.number` inside the EVM is the L1 block number the
 * sequencer has synced to, not the L2 block height. That is the clock the ARB
 * token (`ERC20Votes` checkpoints) and OZ Governor (`quorum`, the
 * `propose()` threshold check) use, so it is the value to derive snapshot
 * blocks from.
 *
 * Reading it from Arbitrum rather than from an L1 RPC matters: the L1 head can
 * be a block or two ahead of what the sequencer has seen, and any checkpoint
 * read at a block Arbitrum has not reached yet reverts with "block not yet
 * mined". Sourcing the clock from the chain we call means no guessing buffer.
 *
 * Uses the same wagmi transport as the governance reads themselves, so the
 * clock and those reads always see the same node.
 */
export function useGovernanceClock(): UseGovernanceClockResult {
  const { data, isPending } = useReadContract({
    address: arbitrum.contracts.multicall3.address,
    abi: MULTICALL3_BLOCK_NUMBER_ABI,
    functionName: "getBlockNumber",
    chainId: ARBITRUM_CHAIN_ID,
    query: {
      refetchInterval: GOVERNANCE_CLOCK_REFRESH_INTERVAL_MS,
      staleTime: GOVERNANCE_CLOCK_REFRESH_INTERVAL_MS,
    },
  });

  return {
    clockBlock: data ?? null,
    isLoading: isPending,
  };
}
