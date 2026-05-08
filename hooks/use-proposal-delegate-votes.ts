"use client";

import { useQuery } from "@tanstack/react-query";
import { ethers } from "ethers";

import { useRpcSettings } from "@/hooks/use-rpc-settings";
import {
  getDelegateDisplayRecords,
  getDelegateVotesWatermarkBlock,
  getProposalVotes,
  type TallyProposalDelegateVote,
  type TallyProposalVoter,
} from "@/lib/delegate-cache";
import { toError } from "@/lib/error-utils";
import { createRpcProvider } from "@/lib/rpc-utils";
import { VOTE_CAST_ABI } from "@/lib/vote-cast-abi";

const RPC_DELTA_CHUNK_SIZE = 10_000_000;

export type ProposalVoter = TallyProposalVoter;

export type ProposalDelegateVotesResult = {
  for: ProposalVoter[];
  against: ProposalVoter[];
  abstain: ProposalVoter[];
  totals: {
    forWeight: string;
    againstWeight: string;
    abstainWeight: string;
    totalCount: number;
  };
};

async function fetchRpcDeltaVotesForProposal({
  l2Rpc,
  proposalId,
  governorAddress,
  fromBlock,
  toBlockBound,
}: {
  l2Rpc: string;
  proposalId: string;
  governorAddress: string;
  fromBlock: number;
  toBlockBound?: number;
}): Promise<TallyProposalDelegateVote[]> {
  const provider = await createRpcProvider(l2Rpc);
  const currentBlock = await provider.getBlockNumber();

  const upperBound =
    toBlockBound !== undefined
      ? Math.min(currentBlock, toBlockBound)
      : currentBlock;

  if (fromBlock > upperBound) return [];

  const records: TallyProposalDelegateVote[] = [];
  const governorLower = governorAddress.toLowerCase();
  const contract = new ethers.Contract(
    governorAddress,
    VOTE_CAST_ABI,
    provider
  );
  const voteCastFilter = contract.filters.VoteCast();
  const voteCastWithParamsFilter = contract.filters.VoteCastWithParams();

  for (let from = fromBlock; from <= upperBound; from += RPC_DELTA_CHUNK_SIZE) {
    const to = Math.min(from + RPC_DELTA_CHUNK_SIZE - 1, upperBound);
    const [voteCastLogs, voteCastWithParamsLogs] = await Promise.all([
      contract.queryFilter(voteCastFilter, from, to),
      contract.queryFilter(voteCastWithParamsFilter, from, to),
    ]);

    for (const log of [...voteCastLogs, ...voteCastWithParamsLogs]) {
      const parsed = contract.interface.parseLog({
        topics: log.topics as string[],
        data: log.data,
      });
      const evtProposalId = ethers.BigNumber.from(
        parsed.args.proposalId
      ).toString();
      if (evtProposalId !== proposalId) continue;

      records.push({
        voter: (parsed.args.voter as string).toLowerCase(),
        proposalId: evtProposalId,
        governorAddress: governorLower,
        support: Number(parsed.args.support) as 0 | 1 | 2,
        weight: parsed.args.weight.toString(),
        blockNumber: log.blockNumber,
      });
    }
  }

  return records;
}

function compareWeightDesc(a: ProposalVoter, b: ProposalVoter): number {
  const aw = BigInt(a.weight);
  const bw = BigInt(b.weight);
  if (aw === bw) return 0;
  return aw > bw ? -1 : 1;
}

function sumWeight(voters: ProposalVoter[]): bigint {
  return voters.reduce((acc, v) => acc + BigInt(v.weight), BigInt(0));
}

export function useProposalDelegateVotes({
  proposalId,
  governorAddress,
  startBlock,
  endBlock,
  enabled = true,
}: {
  proposalId: string;
  governorAddress: string;
  startBlock?: number;
  endBlock?: number;
  enabled?: boolean;
}) {
  const { l2Rpc, isHydrated } = useRpcSettings();

  return useQuery<ProposalDelegateVotesResult, Error>({
    queryKey: [
      "proposal-delegate-votes",
      proposalId,
      governorAddress.toLowerCase(),
      l2Rpc,
    ],
    queryFn: async () => {
      try {
        const [storedVoters, watermarkBlock] = await Promise.all([
          getProposalVotes(proposalId, governorAddress),
          getDelegateVotesWatermarkBlock(),
        ]);

        const merged = new Map<string, ProposalVoter>();
        for (const voter of storedVoters) {
          merged.set(voter.voter.toLowerCase(), voter);
        }

        const sqliteCoversProposal =
          endBlock !== undefined && watermarkBlock >= endBlock;

        let mergedRpcVotes = false;
        if (!sqliteCoversProposal) {
          const fromBlock = Math.max(watermarkBlock + 1, startBlock ?? 0);
          const deltaVotes = await fetchRpcDeltaVotesForProposal({
            l2Rpc,
            proposalId,
            governorAddress,
            fromBlock,
            toBlockBound: endBlock,
          });

          if (deltaVotes.length > 0) {
            const deltaAddresses = deltaVotes.map((v) => v.voter);
            const deltaDisplay =
              await getDelegateDisplayRecords(deltaAddresses);
            for (const vote of deltaVotes) {
              const key = vote.voter.toLowerCase();
              const display = deltaDisplay.get(key) ?? {
                address: key,
                label: null,
                title: null,
                picture: null,
                profileUrl: null,
                source: "address" as const,
              };
              merged.set(key, { ...vote, display });
            }
            mergedRpcVotes = true;
          }
        }

        const allVoters = Array.from(merged.values());
        if (mergedRpcVotes) {
          allVoters.sort(compareWeightDesc);
        }

        const forVoters = allVoters.filter((v) => v.support === 1);
        const againstVoters = allVoters.filter((v) => v.support === 0);
        const abstainVoters = allVoters.filter((v) => v.support === 2);

        return {
          for: forVoters,
          against: againstVoters,
          abstain: abstainVoters,
          totals: {
            forWeight: sumWeight(forVoters).toString(),
            againstWeight: sumWeight(againstVoters).toString(),
            abstainWeight: sumWeight(abstainVoters).toString(),
            totalCount: allVoters.length,
          },
        };
      } catch (err) {
        throw toError(err);
      }
    },
    enabled: enabled && isHydrated && !!proposalId && !!governorAddress,
    staleTime: 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}
