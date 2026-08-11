import "server-only";

import { ADDRESSES } from "@gzeoneth/gov-tracker";
import { unstable_cache } from "next/cache";
import { createPublicClient, http, parseAbi, type Address } from "viem";
import { arbitrum } from "viem/chains";

import {
  ARBITRUM_PUBLIC_RPC_URL,
  ARBITRUM_RPC_URL,
} from "@/config/arbitrum-governance";
import { EXCLUDED_DELEGATE_ADDRESSES } from "@/config/delegates";
import { debug } from "@/lib/debug";
import {
  subtractExcludedVotingPower,
  TOTAL_VOTING_POWER_REVALIDATE_SECONDS,
  type TotalVotingPowerSnapshot,
} from "@/lib/total-voting-power";

class TotalVotingPowerError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "TotalVotingPowerError";
  }
}

const arbTokenAbi = parseAbi([
  "function getTotalDelegation() view returns (uint256)",
  "function getVotes(address account) view returns (uint256)",
]);

/**
 * Read total delegation and the excluded addresses' votes from the ARB token.
 *
 * All reads are pinned to one block and batched through Multicall3: taken
 * separately they could land on different blocks and subtract an exclude
 * balance the total never contained.
 */
async function readTotalVotingPowerFromRpc(
  rpcUrl: string
): Promise<TotalVotingPowerSnapshot> {
  const client = createPublicClient({
    chain: arbitrum,
    transport: http(rpcUrl, { retryCount: 2, retryDelay: 1000 }),
  });

  const token = ADDRESSES.ARB_TOKEN as Address;
  const blockNumber = await client.getBlockNumber();

  const contracts = [
    { address: token, abi: arbTokenAbi, functionName: "getTotalDelegation" },
    ...EXCLUDED_DELEGATE_ADDRESSES.map((address) => ({
      address: token,
      abi: arbTokenAbi,
      functionName: "getVotes",
      args: [address as Address],
    })),
  ];

  // viem infers per-call return types from a literal tuple; this list is built
  // with a spread over the exclude config, so the shape is annotated here
  // instead. Both functions return uint256, hence `bigint[]`.
  const results = (await client.multicall({
    allowFailure: false,
    blockNumber,
    contracts,
  })) as bigint[];

  const [totalDelegation, ...excluded] = results;
  const excludedPowers = excluded.map((power) => power.toString());

  return {
    totalVotingPower: subtractExcludedVotingPower(
      totalDelegation.toString(),
      excludedPowers
    ),
    totalDelegation: totalDelegation.toString(),
    excludedVotingPower: excludedPowers
      .reduce((sum, power) => sum + BigInt(power), BigInt(0))
      .toString(),
    blockNumber: Number(blockNumber),
  };
}

/** Primary RPC first, public Arbitrum RPC as a fallback (as elsewhere on the server). */
async function readTotalVotingPowerWithFallback(): Promise<TotalVotingPowerSnapshot> {
  try {
    return await readTotalVotingPowerFromRpc(ARBITRUM_RPC_URL);
  } catch (primaryErr) {
    if (ARBITRUM_RPC_URL === ARBITRUM_PUBLIC_RPC_URL) throw primaryErr;
    debug.app(
      "total voting power: primary RPC %s failed, falling back to %s: %O",
      ARBITRUM_RPC_URL,
      ARBITRUM_PUBLIC_RPC_URL,
      primaryErr
    );
    try {
      return await readTotalVotingPowerFromRpc(ARBITRUM_PUBLIC_RPC_URL);
    } catch (fallbackErr) {
      const primaryDetail =
        primaryErr instanceof Error ? primaryErr.message : String(primaryErr);
      const fallbackDetail =
        fallbackErr instanceof Error
          ? fallbackErr.message
          : String(fallbackErr);
      throw new TotalVotingPowerError(
        `Both RPCs failed. Primary (${ARBITRUM_RPC_URL}): ${primaryDetail}. Fallback (${ARBITRUM_PUBLIC_RPC_URL}): ${fallbackDetail}.`,
        { cause: fallbackErr }
      );
    }
  }
}

/**
 * The DAO's delegated voting power, computed once per hour for every user.
 *
 * The figure does not vary by user, so it is cached server-side rather than
 * read per browser: one pair of on-chain reads an hour instead of one per
 * visitor per page load.
 */
export const getCachedTotalVotingPower = unstable_cache(
  readTotalVotingPowerWithFallback,
  ["tally-zero-total-voting-power-v1"],
  { revalidate: TOTAL_VOTING_POWER_REVALIDATE_SECONDS }
);
