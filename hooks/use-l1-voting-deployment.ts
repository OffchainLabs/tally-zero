import { useQuery } from "@tanstack/react-query";

import { l1VotingApi } from "@/lib/l1-voting/api";

/**
 * The L1 voting deployment the indexer serves, or null while it serves none (L1 voting is not
 * live, or the indexer has no Ethereum source), so callers can hide L1 voting entirely.
 */
export function useL1VotingDeployment() {
  const { data, isPending } = useQuery({
    queryKey: ["l1-voting", "deployment"],
    queryFn: () => l1VotingApi.deployment(),
    retry: false,
    staleTime: 5 * 60_000,
  });
  return { deployment: data ?? null, isPending };
}
