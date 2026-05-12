"use client";

import { useQuery } from "@tanstack/react-query";
import { ethers } from "ethers";

import { useRpcSettings } from "@/hooks/use-rpc-settings";
import { getDelegateVotes } from "@/lib/delegate-data";
import { toError } from "@/lib/error-utils";
import { createRpcProvider } from "@/lib/rpc-utils";
import type { TallyDelegateVote } from "@/lib/tally-data/types";
import { VOTE_CAST_ABI } from "@/lib/vote-cast-abi";

export interface UserVoteReceipt {
  support: number;
  weight: string;
}

export function findCachedUserVote({
  votes,
  proposalId,
  governorAddress,
}: {
  votes: readonly TallyDelegateVote[];
  proposalId: string;
  governorAddress: string;
}): UserVoteReceipt | null {
  const governorLower = governorAddress.toLowerCase();
  const vote = votes.find(
    (record) =>
      record.proposalId === proposalId &&
      record.governorAddress.toLowerCase() === governorLower
  );

  if (!vote) return null;

  return {
    support: vote.support,
    weight: vote.weight,
  };
}

export function useUserVote({
  proposalId,
  governorAddress,
  voter,
  enabled = true,
}: {
  proposalId: string;
  governorAddress: string;
  voter: string | undefined;
  enabled?: boolean;
}) {
  const { l2Rpc, isHydrated } = useRpcSettings();

  return useQuery<UserVoteReceipt | null, Error>({
    queryKey: [
      "user-vote",
      proposalId,
      governorAddress.toLowerCase(),
      voter?.toLowerCase() ?? null,
      l2Rpc,
    ],
    queryFn: async () => {
      if (!voter) return null;
      try {
        try {
          const cachedVote = findCachedUserVote({
            votes: await getDelegateVotes(voter),
            proposalId,
            governorAddress,
          });
          if (cachedVote) return cachedVote;
        } catch {
          // Fall back to RPC logs if the local vote index cannot be read.
        }

        const provider = await createRpcProvider(l2Rpc);
        const contract = new ethers.Contract(
          governorAddress,
          VOTE_CAST_ABI,
          provider
        );

        const [voteCastLogs, voteCastWithParamsLogs] = await Promise.all([
          contract.queryFilter(contract.filters.VoteCast(voter)),
          contract.queryFilter(contract.filters.VoteCastWithParams(voter)),
        ]);

        const target = ethers.BigNumber.from(proposalId);
        const match = [...voteCastLogs, ...voteCastWithParamsLogs].find(
          (log) => {
            const parsed = contract.interface.parseLog({
              topics: log.topics as string[],
              data: log.data,
            });
            return ethers.BigNumber.from(parsed.args.proposalId).eq(target);
          }
        );

        if (!match) return null;

        const parsed = contract.interface.parseLog({
          topics: match.topics as string[],
          data: match.data,
        });
        return {
          support: Number(parsed.args.support),
          weight: parsed.args.weight.toString(),
        };
      } catch (err) {
        throw toError(err);
      }
    },
    enabled:
      enabled && isHydrated && !!voter && !!proposalId && !!governorAddress,
    staleTime: 60_000,
  });
}
