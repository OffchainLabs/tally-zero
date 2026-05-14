"use client";

import { useQuery } from "@tanstack/react-query";
import { ethers } from "ethers";

import { ADDRESSES, ERC20_VOTES_ABI } from "@gzeoneth/gov-tracker";

import { useRpcSettings } from "@/hooks/use-rpc-settings";
import { addressesEqual } from "@/lib/address-utils";
import { toError } from "@/lib/error-utils";
import {
  MULTICALL3_ADDRESS,
  MULTICALL3_AGGREGATE3_ABI,
} from "@/lib/multicall3";
import { createRpcProvider } from "@/lib/rpc-utils";

// Items missing from @gzeoneth/gov-tracker's ERC20_VOTES_ABI that we need:
// - DelegateChanged: emitted by the ARB token on every delegation change.
// - balanceOf: standard ERC20, used to show each delegator's contribution.
// Sources: OpenZeppelin ERC20Votes and ERC20 reference implementations.
const ARB_TOKEN_ABI_EXTRAS = [
  "event DelegateChanged(address indexed delegator, address indexed fromDelegate, address indexed toDelegate)",
  "function balanceOf(address account) view returns (uint256)",
];

const ARB_TOKEN_DELEGATORS_ABI = [...ERC20_VOTES_ABI, ...ARB_TOKEN_ABI_EXTRAS];

const ARB_TOKEN_DEPLOY_BLOCK = 70_398_823;
const CHUNK_SIZE = 10_000_000;
const PARALLEL_BATCH_SIZE = 4;

export interface MyDelegatorRecord {
  address: string;
  balance: string;
}

async function fetchDelegators(
  l2Rpc: string,
  delegateAddress: string
): Promise<MyDelegatorRecord[]> {
  const provider = await createRpcProvider(l2Rpc);
  const currentBlock = await provider.getBlockNumber();

  const arbTokenContract = new ethers.Contract(
    ADDRESSES.ARB_TOKEN,
    ARB_TOKEN_DELEGATORS_ABI,
    provider
  );
  const arbInterface = arbTokenContract.interface;

  const filter = arbTokenContract.filters.DelegateChanged(
    null,
    null,
    delegateAddress
  );

  const chunks: Array<{ from: number; to: number }> = [];
  for (
    let from = ARB_TOKEN_DEPLOY_BLOCK;
    from <= currentBlock;
    from += CHUNK_SIZE
  ) {
    chunks.push({
      from,
      to: Math.min(from + CHUNK_SIZE - 1, currentBlock),
    });
  }

  const candidateDelegators = new Set<string>();
  for (let i = 0; i < chunks.length; i += PARALLEL_BATCH_SIZE) {
    const batch = chunks.slice(i, i + PARALLEL_BATCH_SIZE);
    const results = await Promise.all(
      batch.map(({ from, to }) =>
        arbTokenContract.queryFilter(filter, from, to)
      )
    );
    for (const events of results) {
      for (const event of events) {
        const parsed = arbInterface.parseLog({
          topics: event.topics as string[],
          data: event.data,
        });
        candidateDelegators.add(String(parsed.args.delegator).toLowerCase());
      }
    }
  }

  if (candidateDelegators.size === 0) return [];

  const delegatorList = Array.from(candidateDelegators);
  const multicall = new ethers.Contract(
    MULTICALL3_ADDRESS,
    MULTICALL3_AGGREGATE3_ABI,
    provider
  );

  const delegatesCalls = delegatorList.map((addr) => ({
    target: ADDRESSES.ARB_TOKEN,
    allowFailure: true,
    callData: arbInterface.encodeFunctionData("delegates", [addr]),
  }));

  const delegatesResults: { success: boolean; returnData: string }[] =
    await multicall.callStatic.aggregate3(delegatesCalls);

  const activeDelegators: string[] = [];
  delegatorList.forEach((addr, i) => {
    const result = delegatesResults[i];
    if (!result?.success) return;
    const [currentDelegate] = arbInterface.decodeFunctionResult(
      "delegates",
      result.returnData
    );
    if (addressesEqual(currentDelegate, delegateAddress)) {
      activeDelegators.push(addr);
    }
  });

  if (activeDelegators.length === 0) return [];

  const balanceCalls = activeDelegators.map((addr) => ({
    target: ADDRESSES.ARB_TOKEN,
    allowFailure: true,
    callData: arbInterface.encodeFunctionData("balanceOf", [addr]),
  }));

  const balanceResults: { success: boolean; returnData: string }[] =
    await multicall.callStatic.aggregate3(balanceCalls);

  const records: MyDelegatorRecord[] = [];
  activeDelegators.forEach((addr, i) => {
    const result = balanceResults[i];
    if (!result?.success) return;
    const [balance] = arbInterface.decodeFunctionResult(
      "balanceOf",
      result.returnData
    );
    records.push({
      address: addr,
      balance: balance.toString(),
    });
  });

  records.sort((a, b) => {
    const aBalance = BigInt(a.balance);
    const bBalance = BigInt(b.balance);
    if (aBalance > bBalance) return -1;
    if (aBalance < bBalance) return 1;
    return 0;
  });

  return records;
}

export function useMyDelegators(delegateAddress: string | undefined) {
  const { l2Rpc, isHydrated } = useRpcSettings();

  return useQuery<MyDelegatorRecord[], Error>({
    queryKey: ["my-delegators", delegateAddress?.toLowerCase() ?? null, l2Rpc],
    queryFn: async () => {
      if (!delegateAddress) return [];
      try {
        return await fetchDelegators(l2Rpc, delegateAddress);
      } catch (err) {
        throw toError(err);
      }
    },
    enabled: isHydrated && !!delegateAddress,
    staleTime: Infinity,
    gcTime: 30 * 60 * 1000,
  });
}
