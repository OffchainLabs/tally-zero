"use client";

import { useQuery } from "@tanstack/react-query";
import { ethers } from "ethers";

import { useRpcSettings } from "@/hooks/use-rpc-settings";
import {
  getDelegateVotes,
  getDelegateVotesWatermarkBlock,
  type TallyDelegateVote,
} from "@/lib/delegate-cache";
import { toError } from "@/lib/error-utils";
import { createRpcProvider } from "@/lib/rpc-utils";
import { VOTE_CAST_ABI } from "@/lib/vote-cast-abi";
import { ARBITRUM_GOVERNORS } from "@config/arbitrum-governance";

const RPC_DELTA_CHUNK_SIZE = 10_000_000;

export type DelegateVoteRecord = TallyDelegateVote;

export function delegateVoteKey(
  proposalId: string,
  governorAddress: string
): string {
  return `${proposalId}:${governorAddress.toLowerCase()}`;
}

async function fetchRpcDeltaVotes(
  l2Rpc: string,
  voter: string,
  fromBlock: number
): Promise<DelegateVoteRecord[]> {
  const provider = await createRpcProvider(l2Rpc);
  const currentBlock = await provider.getBlockNumber();

  if (fromBlock > currentBlock) return [];

  const records: DelegateVoteRecord[] = [];

  for (const governor of ARBITRUM_GOVERNORS) {
    const contract = new ethers.Contract(
      governor.address,
      VOTE_CAST_ABI,
      provider
    );
    const voteCastFilter = contract.filters.VoteCast(voter);
    const voteCastWithParamsFilter = contract.filters.VoteCastWithParams(voter);

    for (
      let from = fromBlock;
      from <= currentBlock;
      from += RPC_DELTA_CHUNK_SIZE
    ) {
      const to = Math.min(from + RPC_DELTA_CHUNK_SIZE - 1, currentBlock);
      const [voteCastLogs, voteCastWithParamsLogs] = await Promise.all([
        contract.queryFilter(voteCastFilter, from, to),
        contract.queryFilter(voteCastWithParamsFilter, from, to),
      ]);

      for (const log of [...voteCastLogs, ...voteCastWithParamsLogs]) {
        const parsed = contract.interface.parseLog({
          topics: log.topics as string[],
          data: log.data,
        });
        records.push({
          proposalId: ethers.BigNumber.from(parsed.args.proposalId).toString(),
          governorAddress: governor.address.toLowerCase(),
          support: Number(parsed.args.support) as 0 | 1 | 2,
          weight: parsed.args.weight.toString(),
          blockNumber: log.blockNumber,
        });
      }
    }
  }

  return records;
}

export function useDelegateVotes(voter: string | undefined) {
  const { l2Rpc, isHydrated } = useRpcSettings();

  return useQuery<Map<string, DelegateVoteRecord>, Error>({
    queryKey: ["delegate-votes", voter?.toLowerCase() ?? null, l2Rpc],
    queryFn: async () => {
      if (!voter) return new Map();
      try {
        const [storedVotes, watermarkBlock] = await Promise.all([
          getDelegateVotes(voter),
          getDelegateVotesWatermarkBlock(),
        ]);

        const merged = new Map<string, DelegateVoteRecord>();
        for (const vote of storedVotes) {
          merged.set(
            delegateVoteKey(vote.proposalId, vote.governorAddress),
            vote
          );
        }

        const deltaVotes = await fetchRpcDeltaVotes(
          l2Rpc,
          voter,
          watermarkBlock + 1
        );
        for (const vote of deltaVotes) {
          merged.set(
            delegateVoteKey(vote.proposalId, vote.governorAddress),
            vote
          );
        }

        return merged;
      } catch (err) {
        throw toError(err);
      }
    },
    enabled: isHydrated && !!voter,
    staleTime: Infinity,
    gcTime: 30 * 60 * 1000,
  });
}
