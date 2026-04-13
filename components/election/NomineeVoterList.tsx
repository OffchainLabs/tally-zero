"use client";

import { BigNumber } from "ethers";
import { ExternalLink, Users } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { useElectionContracts } from "@/hooks/use-election-contracts";
import { useElectionStatus } from "@/hooks/use-election-status";
import { useNomineeVoters } from "@/hooks/use-nominee-voters";
import { useRpcSettings } from "@/hooks/use-rpc-settings";
import { getAddressExplorerUrl } from "@/lib/explorer-utils";
import { formatVotingPower, shortenAddress } from "@/lib/format-utils";

interface NomineeVoterListProps {
  address: string;
}

export function NomineeVoterList({
  address,
}: NomineeVoterListProps): React.ReactElement | null {
  const { memberGovernorAddress } = useElectionContracts();
  const { l2Rpc, l1Rpc, l1ChunkSize, l2ChunkSize, isHydrated } =
    useRpcSettings();

  const { selectedElection } = useElectionStatus({
    enabled: isHydrated,
    l2RpcUrl: l2Rpc || undefined,
    l1RpcUrl: l1Rpc || undefined,
    l1ChunkSize,
    l2ChunkSize,
  });

  const phase = selectedElection?.phase;
  const isMemberElection = phase === "MEMBER_ELECTION";
  const proposalId = isMemberElection
    ? (selectedElection?.memberProposalId ?? "")
    : "";

  const { voters, isLoading, error } = useNomineeVoters({
    proposalId,
    memberGovernorAddress,
    nomineeAddress: address,
  });

  // Only render during member election
  if (!isMemberElection) return null;

  if (isLoading) {
    return (
      <Card variant="glass">
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error || voters.length === 0) return null;

  const totalWeightedVotes = voters
    .reduce(
      (sum, v) => sum.add(BigNumber.from(v.weightedVotes)),
      BigNumber.from(0)
    )
    .toString();

  return (
    <Card variant="glass">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          Votes Received
        </CardTitle>
        <CardDescription>
          {formatVotingPower(totalWeightedVotes)} total weighted votes from{" "}
          {voters.length} delegate{voters.length !== 1 ? "s" : ""}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="divide-y divide-border">
          {voters.map((voter) => (
            <div
              key={voter.address}
              className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
            >
              <div className="flex items-center gap-2 min-w-0">
                {voter.picture && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={voter.picture}
                    alt=""
                    className="h-6 w-6 rounded-full object-cover shrink-0"
                  />
                )}
                <a
                  href={getAddressExplorerUrl(voter.address)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors truncate"
                >
                  <span className="truncate">
                    {voter.label || shortenAddress(voter.address)}
                  </span>
                  <ExternalLink className="h-3 w-3 shrink-0" />
                </a>
              </div>
              <span className="text-sm font-medium tabular-nums shrink-0">
                {formatVotingPower(voter.weightedVotes)} weighted
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
