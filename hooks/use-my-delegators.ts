"use client";

import { useQuery } from "@tanstack/react-query";
import { ethers } from "ethers";
import {
  type Abi,
  type Address,
  type MulticallResponse,
  createPublicClient,
  http,
} from "viem";
import { arbitrum } from "viem/chains";

import { ADDRESSES } from "@gzeoneth/gov-tracker";

import { useRpcSettings } from "@/hooks/use-rpc-settings";
import { addressesEqual } from "@/lib/address-utils";
import { delay } from "@/lib/delay-utils";
import { toError } from "@/lib/error-utils";
import { createRpcProvider, queryWithRetry } from "@/lib/rpc-utils";

// DelegateChanged is emitted by the ARB token on every delegation change.
// It is not in @gzeoneth/gov-tracker's ERC20_VOTES_ABI, so we declare it
// here for the ethers-based event scan below.
// Source: OpenZeppelin ERC20Votes reference implementation.
const ARB_TOKEN_EVENT_ABI = [
  "event DelegateChanged(address indexed delegator, address indexed fromDelegate, address indexed toDelegate)",
];

const ARB_TOKEN_READ_ABI = [
  {
    type: "function",
    name: "delegates",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const satisfies Abi;

export const ARB_TOKEN_DEPLOY_BLOCK = 70_398_823;

const DEFAULT_LOG_CHUNK_SIZE = 10_000_000;
const MIN_LOG_CHUNK_SIZE = 25_000;
const PARALLEL_LOG_BATCH_SIZE = 4;
const DELAY_BETWEEN_LOG_BATCHES_MS = 100;
const MULTICALL_BATCH_SIZE = 250;

export interface MyDelegatorRecord {
  address: string;
  balance: string;
}

type BlockRange = {
  from: number;
  to: number;
};

export type DelegatesMulticallResult = MulticallResponse<Address, Error, true>;
export type BalanceMulticallResult = MulticallResponse<bigint, Error, true>;

type FetchDelegatorsOptions = {
  chunkSize: number;
  signal?: AbortSignal;
};

export function myDelegatorsQueryKey(
  delegateAddress: string | undefined,
  l2Rpc: string
) {
  return ["my-delegators", delegateAddress?.toLowerCase() ?? null, l2Rpc];
}

export function createBlockRanges(
  fromBlock: number,
  toBlock: number,
  chunkSize: number
): BlockRange[] {
  if (fromBlock > toBlock) return [];

  const normalizedChunkSize = normalizeChunkSize(chunkSize);
  const ranges: BlockRange[] = [];
  for (let from = fromBlock; from <= toBlock; from += normalizedChunkSize) {
    ranges.push({
      from,
      to: Math.min(from + normalizedChunkSize - 1, toBlock),
    });
  }
  return ranges;
}

export function decodeActiveDelegators({
  delegatorList,
  delegateResults,
  delegateAddress,
}: {
  delegatorList: string[];
  delegateResults: ReadonlyArray<DelegatesMulticallResult>;
  delegateAddress: string;
}): string[] {
  const activeDelegators: string[] = [];

  delegatorList.forEach((addr, i) => {
    const result = delegateResults[i];
    if (result?.status !== "success") return;
    if (addressesEqual(result.result, delegateAddress)) {
      activeDelegators.push(addr);
    }
  });

  return activeDelegators;
}

export function decodeDelegatorBalances({
  activeDelegators,
  balanceResults,
}: {
  activeDelegators: string[];
  balanceResults: ReadonlyArray<BalanceMulticallResult>;
}): MyDelegatorRecord[] {
  const records: MyDelegatorRecord[] = [];

  activeDelegators.forEach((addr, i) => {
    const result = balanceResults[i];
    if (result?.status !== "success") return;
    records.push({
      address: addr,
      balance: result.result.toString(),
    });
  });

  return sortDelegatorRecords(records);
}

export function sortDelegatorRecords(
  records: MyDelegatorRecord[]
): MyDelegatorRecord[] {
  return [...records].sort((a, b) => {
    const aBalance = BigInt(a.balance);
    const bBalance = BigInt(b.balance);
    if (aBalance > bBalance) return -1;
    if (aBalance < bBalance) return 1;
    return a.address.localeCompare(b.address);
  });
}

export async function fetchDelegators(
  l2Rpc: string,
  delegateAddress: string,
  options: FetchDelegatorsOptions
): Promise<MyDelegatorRecord[]> {
  const provider = await createRpcProvider(l2Rpc);
  const currentBlock = await queryWithRetry(() => provider.getBlockNumber());
  throwIfAborted(options.signal);

  const arbInterface = new ethers.utils.Interface(ARB_TOKEN_EVENT_ABI);

  const candidateDelegators = await fetchCandidateDelegators({
    provider,
    arbInterface,
    delegateAddress,
    currentBlock,
    chunkSize: options.chunkSize,
    signal: options.signal,
  });

  if (candidateDelegators.size === 0) return [];

  const delegatorList = Array.from(candidateDelegators);

  const publicClient = createPublicClient({
    chain: arbitrum,
    transport: http(l2Rpc, {
      retryCount: 2,
      retryDelay: 1000,
    }),
  });

  throwIfAborted(options.signal);

  const delegatesResults: DelegatesMulticallResult[] = [];
  for (let i = 0; i < delegatorList.length; i += MULTICALL_BATCH_SIZE) {
    throwIfAborted(options.signal);
    const batch = delegatorList.slice(i, i + MULTICALL_BATCH_SIZE);
    const batchResults = await queryWithRetry(() =>
      publicClient.multicall({
        contracts: batch.map((addr) => ({
          address: ADDRESSES.ARB_TOKEN,
          abi: ARB_TOKEN_READ_ABI,
          functionName: "delegates" as const,
          args: [addr as Address],
        })),
        allowFailure: true,
      })
    );
    delegatesResults.push(...batchResults);
  }

  const activeDelegators = decodeActiveDelegators({
    delegatorList,
    delegateResults: delegatesResults,
    delegateAddress,
  });

  if (activeDelegators.length === 0) return [];

  throwIfAborted(options.signal);

  const balanceResults: BalanceMulticallResult[] = [];
  for (let i = 0; i < activeDelegators.length; i += MULTICALL_BATCH_SIZE) {
    throwIfAborted(options.signal);
    const batch = activeDelegators.slice(i, i + MULTICALL_BATCH_SIZE);
    const batchResults = await queryWithRetry(() =>
      publicClient.multicall({
        contracts: batch.map((addr) => ({
          address: ADDRESSES.ARB_TOKEN,
          abi: ARB_TOKEN_READ_ABI,
          functionName: "balanceOf" as const,
          args: [addr as Address],
        })),
        allowFailure: true,
      })
    );
    balanceResults.push(...batchResults);
  }

  return decodeDelegatorBalances({
    activeDelegators,
    balanceResults,
  });
}

async function fetchCandidateDelegators({
  provider,
  arbInterface,
  delegateAddress,
  currentBlock,
  chunkSize,
  signal,
}: {
  provider: ethers.providers.Provider;
  arbInterface: ethers.utils.Interface;
  delegateAddress: string;
  currentBlock: number;
  chunkSize: number;
  signal?: AbortSignal;
}): Promise<Set<string>> {
  const topics = [
    arbInterface.getEventTopic("DelegateChanged"),
    null,
    null,
    ethers.utils.hexZeroPad(ethers.utils.getAddress(delegateAddress), 32),
  ];

  const candidateDelegators = new Set<string>();
  const ranges = createBlockRanges(
    ARB_TOKEN_DEPLOY_BLOCK,
    currentBlock,
    chunkSize
  );

  for (let i = 0; i < ranges.length; i += PARALLEL_LOG_BATCH_SIZE) {
    throwIfAborted(signal);

    const batch = ranges.slice(i, i + PARALLEL_LOG_BATCH_SIZE);
    const logGroups = await Promise.all(
      batch.map(({ from, to }) =>
        getDelegateChangedLogs({
          provider,
          topics,
          fromBlock: from,
          toBlock: to,
          signal,
        })
      )
    );

    for (const logs of logGroups) {
      for (const log of logs) {
        const parsed = arbInterface.parseLog(log);
        candidateDelegators.add(String(parsed.args.delegator).toLowerCase());
      }
    }

    if (i + PARALLEL_LOG_BATCH_SIZE < ranges.length) {
      await delay(DELAY_BETWEEN_LOG_BATCHES_MS);
    }
  }

  return candidateDelegators;
}

async function getDelegateChangedLogs({
  provider,
  topics,
  fromBlock,
  toBlock,
  signal,
}: {
  provider: ethers.providers.Provider;
  topics: ethers.providers.Filter["topics"];
  fromBlock: number;
  toBlock: number;
  signal?: AbortSignal;
}): Promise<ethers.providers.Log[]> {
  throwIfAborted(signal);

  try {
    return await queryWithRetry(
      () =>
        provider.getLogs({
          address: ADDRESSES.ARB_TOKEN,
          topics,
          fromBlock,
          toBlock,
        }),
      {
        maxRetries: 1,
        initialDelay: 500,
        maxDelay: 1000,
        backoffFactor: 2,
      }
    );
  } catch (err) {
    const blockCount = toBlock - fromBlock + 1;
    if (!shouldSplitLogRangeError(err) || blockCount <= MIN_LOG_CHUNK_SIZE) {
      throw err;
    }

    const midBlock = fromBlock + Math.floor(blockCount / 2) - 1;
    const firstHalf = await getDelegateChangedLogs({
      provider,
      topics,
      fromBlock,
      toBlock: midBlock,
      signal,
    });
    const secondHalf = await getDelegateChangedLogs({
      provider,
      topics,
      fromBlock: midBlock + 1,
      toBlock,
      signal,
    });
    return [...firstHalf, ...secondHalf];
  }
}

function normalizeChunkSize(chunkSize: number): number {
  if (!Number.isFinite(chunkSize) || chunkSize < MIN_LOG_CHUNK_SIZE) {
    return MIN_LOG_CHUNK_SIZE;
  }
  return Math.min(Math.floor(chunkSize), DEFAULT_LOG_CHUNK_SIZE);
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  if (signal.reason instanceof Error) {
    throw signal.reason;
  }
  throw new Error("Delegator lookup cancelled.");
}

export function shouldSplitLogRangeError(error: unknown): boolean {
  const message = toError(error).message.toLowerCase();
  const code = getErrorCode(error).toLowerCase();

  return (
    code === "-32000" ||
    code === "server_error" ||
    message.includes("exceeds limit") ||
    message.includes("too many") ||
    message.includes("response size exceeded") ||
    message.includes("internal server") ||
    message.includes("server_error") ||
    message.includes("server error") ||
    message.includes("more than") ||
    message.includes("block range")
  );
}

function getErrorCode(error: unknown): string {
  if (!error || typeof error !== "object") return "";
  if ("code" in error) return String((error as { code: unknown }).code);
  if ("error" in error) {
    const nested = (error as { error: unknown }).error;
    if (nested && typeof nested === "object" && "code" in nested) {
      return String((nested as { code: unknown }).code);
    }
  }
  return "";
}

export function useMyDelegators(delegateAddress: string | undefined) {
  const { l2Rpc, l2ChunkSize, isHydrated } = useRpcSettings();

  return useQuery<MyDelegatorRecord[], Error>({
    queryKey: myDelegatorsQueryKey(delegateAddress, l2Rpc),
    queryFn: async ({ signal }) => {
      if (!delegateAddress) return [];
      try {
        return await fetchDelegators(l2Rpc, delegateAddress, {
          chunkSize: l2ChunkSize,
          signal,
        });
      } catch (err) {
        throw toError(err);
      }
    },
    enabled: isHydrated && !!delegateAddress,
    staleTime: 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}
