"use client";

import { useAccount } from "wagmi";

import { nomineeElectionGovernorReadAbi } from "@gzeoneth/gov-tracker";
import { AlertCircle, CheckCircle2, Vote, Wallet } from "lucide-react";

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
import { useElectionVotingPower } from "@/hooks/use-election-voting-power";
import { useRpcSettings } from "@/hooks/use-rpc-settings";
import { formatVotingPower } from "@/lib/format-utils";

import { ContenderQuorumBar } from "./ContenderQuorumBar";
import { ElectionVoteRow } from "./ElectionVoteRow";
import { VotingPowerSummary } from "./VotingPowerSummary";

interface ContenderVoteCardProps {
  address: string;
}

export function ContenderVoteCard({
  address,
}: ContenderVoteCardProps): React.ReactElement | null {
  const { isConnected } = useAccount();
  const { nomineeGovernorAddress, chainId } = useElectionContracts();
  const { l2Rpc, l1Rpc, l1ChunkSize, l2ChunkSize, isHydrated } =
    useRpcSettings();

  const { selectedElection, nomineeDetails, isLoading } = useElectionStatus({
    enabled: isHydrated,
    l2RpcUrl: l2Rpc || undefined,
    l1RpcUrl: l1Rpc || undefined,
    l1ChunkSize,
    l2ChunkSize,
  });

  const isNomineeSelection = selectedElection?.phase === "NOMINEE_SELECTION";
  const proposalId = selectedElection?.nomineeProposalId;

  const { totalVotingPower, usedVotes, availableVotes, refetchUsedVotes } =
    useElectionVotingPower({
      proposalId: proposalId ?? "",
      governorAddress: nomineeGovernorAddress,
      governorReadAbi: nomineeElectionGovernorReadAbi,
    });

  if (isLoading) {
    return (
      <Card variant="glass">
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!isNomineeSelection || !proposalId) {
    return null;
  }

  const nomineeData = nomineeDetails?.nominees.find(
    (n) => n.address.toLowerCase() === address.toLowerCase()
  );
  const votes = nomineeData?.votesReceived ?? "0";
  const quorumThreshold = nomineeDetails?.quorumThreshold ?? "0";

  return (
    <Card variant="glass">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Vote className="h-5 w-5" />
          Vote for this Contender
        </CardTitle>
        {quorumThreshold !== "0" && (
          <CardDescription>
            Needs {formatVotingPower(quorumThreshold)} ARB to qualify as a
            nominee
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <ContenderQuorumBar votes={votes} quorumThreshold={quorumThreshold} />

        {!isConnected ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Wallet className="h-4 w-4" />
            Connect your wallet to vote
          </div>
        ) : (
          <>
            <VotingPowerSummary
              totalVotingPower={totalVotingPower}
              usedVotes={usedVotes}
              availableVotes={availableVotes}
            />

            {totalVotingPower !== undefined &&
              totalVotingPower === BigInt(0) && <NoVotingPowerWarning />}

            {availableVotes !== undefined &&
              availableVotes === BigInt(0) &&
              usedVotes !== undefined &&
              usedVotes > BigInt(0) && <AllVotesUsedNotice />}

            <ElectionVoteRow
              proposalId={proposalId}
              targetAddress={address}
              governorAddress={nomineeGovernorAddress}
              chainId={chainId}
              availableVotes={availableVotes}
              onVoteSuccess={refetchUsedVotes}
              infoSlot={null}
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}

function NoVotingPowerWarning() {
  return (
    <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3">
      <div className="flex items-start gap-2 text-yellow-500">
        <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
        <div className="text-sm">
          <p className="font-medium">No voting power</p>
          <p className="text-yellow-500/80 mt-1">
            Your wallet has no voting power for this election. Voting power is
            based on delegated ARB tokens at the proposal snapshot block.
          </p>
        </div>
      </div>
    </div>
  );
}

function AllVotesUsedNotice() {
  return (
    <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-3">
      <div className="flex items-center gap-2 text-green-500">
        <CheckCircle2 className="h-4 w-4 shrink-0" />
        <span className="text-sm">
          You have used all your voting power for this round.
        </span>
      </div>
    </div>
  );
}
