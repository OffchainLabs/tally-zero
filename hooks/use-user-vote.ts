"use client";

import { useQuery } from "@tanstack/react-query";
import { ethers } from "ethers";

import { useRpcSettings } from "@/hooks/use-rpc-settings";
import { toError } from "@/lib/error-utils";
import { createRpcProvider } from "@/lib/rpc-utils";

export interface UserVoteReceipt {
  support: number;
  weight: string;
}

const VOTE_CAST_ABI = [
  "event VoteCast(address indexed voter, uint256 proposalId, uint8 support, uint256 weight, string reason)",
  "event VoteCastWithParams(address indexed voter, uint256 proposalId, uint8 support, uint256 weight, string reason, bytes params)",
];

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
