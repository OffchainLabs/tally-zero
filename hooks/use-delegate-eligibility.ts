"use client";

import { useQuery } from "@tanstack/react-query";
import { ethers } from "ethers";

import { useRpcSettings } from "@/hooks/use-rpc-settings";
import { toError } from "@/lib/error-utils";
import { createRpcProvider } from "@/lib/rpc-utils";
import { ADDRESSES } from "@gzeoneth/gov-tracker";

const MULTICALL3_ADDRESS = "0xcA11bde05977b3631167028862bE2a173976CA11";

const MULTICALL3_ABI = [
  "function aggregate3((address target, bool allowFailure, bytes callData)[] calls) external view returns ((bool success, bytes returnData)[] returnData)",
];

const ERC20_VOTES_ABI = [
  "function getPastVotes(address account, uint256 blockNumber) view returns (uint256)",
];

export function eligibilityKey(snapshotBlock: number): string {
  return String(snapshotBlock);
}

export function useDelegateEligibility(
  voter: string | undefined,
  snapshotBlocks: number[],
  options: { enabled?: boolean } = {}
) {
  const { enabled = true } = options;
  const { l2Rpc, isHydrated } = useRpcSettings();

  const uniqueBlocks = Array.from(new Set(snapshotBlocks)).sort(
    (a, b) => a - b
  );
  const blocksKey = uniqueBlocks.join(",");

  return useQuery<Map<string, bigint>, Error>({
    queryKey: [
      "delegate-eligibility",
      voter?.toLowerCase() ?? null,
      blocksKey,
      l2Rpc,
    ],
    queryFn: async () => {
      if (!voter || uniqueBlocks.length === 0) return new Map();
      try {
        const provider = await createRpcProvider(l2Rpc);
        const votesInterface = new ethers.utils.Interface(ERC20_VOTES_ABI);
        const multicall = new ethers.Contract(
          MULTICALL3_ADDRESS,
          MULTICALL3_ABI,
          provider
        );

        const calls = uniqueBlocks.map((block) => ({
          target: ADDRESSES.ARB_TOKEN,
          allowFailure: true,
          callData: votesInterface.encodeFunctionData("getPastVotes", [
            voter,
            block,
          ]),
        }));

        const results: { success: boolean; returnData: string }[] =
          await multicall.callStatic.aggregate3(calls);

        const map = new Map<string, bigint>();
        for (let i = 0; i < uniqueBlocks.length; i += 1) {
          const block = uniqueBlocks[i];
          const result = results[i];
          if (result.success) {
            const decoded = votesInterface.decodeFunctionResult(
              "getPastVotes",
              result.returnData
            );
            map.set(eligibilityKey(block), BigInt(decoded[0].toString()));
          } else {
            map.set(eligibilityKey(block), BigInt(0));
          }
        }

        return map;
      } catch (err) {
        throw toError(err);
      }
    },
    enabled: enabled && isHydrated && !!voter && uniqueBlocks.length > 0,
    staleTime: Infinity,
    gcTime: 30 * 60 * 1000,
  });
}
