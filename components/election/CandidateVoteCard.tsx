"use client";

import { useRef } from "react";
import { useAccount, useBlockNumber } from "wagmi";

import type { SerializableMemberNominee } from "@gzeoneth/gov-tracker";
import {
  memberElectionGovernorReadAbi,
  nomineeElectionGovernorReadAbi,
  prepareMemberElectionVote,
} from "@gzeoneth/gov-tracker";
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

interface CandidateVoteCardProps {
  address: string;
}

export function CandidateVoteCard({
  address,
}: CandidateVoteCardProps): React.ReactElement | null {
  const { isConnected } = useAccount();
  const { nomineeGovernorAddress, memberGovernorAddress, chainId } =
    useElectionContracts();
  const { l2Rpc, l1Rpc, l1ChunkSize, l2ChunkSize, isHydrated } =
    useRpcSettings();

  const { selectedElection, nomineeDetails, memberDetails, isLoading } =
    useElectionStatus({
      enabled: isHydrated,
      l2RpcUrl: l2Rpc || undefined,
      l1RpcUrl: l1Rpc || undefined,
      l1ChunkSize,
      l2ChunkSize,
    });

  const phase = selectedElection?.phase;
  const isNomineeSelection = phase === "NOMINEE_SELECTION";
  const isMemberElection = phase === "MEMBER_ELECTION";

  const proposalId = isNomineeSelection
    ? selectedElection?.nomineeProposalId
    : isMemberElection
      ? selectedElection?.memberProposalId
      : null;

  const governorAddress = isMemberElection
    ? memberGovernorAddress
    : nomineeGovernorAddress;

  const governorReadAbi = isMemberElection
    ? memberElectionGovernorReadAbi
    : nomineeElectionGovernorReadAbi;

  const { totalVotingPower, usedVotes, availableVotes, refetchUsedVotes } =
    useElectionVotingPower({
      proposalId: proposalId ?? "",
      governorAddress,
      governorReadAbi,
    });

  const { data: currentBlock } = useBlockNumber({ watch: true });

  // Only show skeleton on first load
  const hasLoadedRef = useRef(false);
  if (nomineeDetails || memberDetails) {
    hasLoadedRef.current = true;
  }

  if (isLoading && !hasLoadedRef.current) {
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

  if (!proposalId || (!isNomineeSelection && !isMemberElection)) {
    return null;
  }

  // Phase-specific data
  let infoSlot: React.ReactNode = null;
  let quorumBar: React.ReactNode = null;
  let description: React.ReactNode = null;
  let weightStatus: React.ReactNode = null;
  let title: string;

  if (isNomineeSelection) {
    title = "Vote for this Contender";
    const nomineeData = nomineeDetails?.nominees.find(
      (n) => n.address.toLowerCase() === address.toLowerCase()
    );
    const votes = nomineeData?.votesReceived ?? "0";
    const quorumThreshold = nomineeDetails?.quorumThreshold ?? "0";

    if (quorumThreshold !== "0") {
      description = (
        <CardDescription>
          Needs {formatVotingPower(quorumThreshold)} ARB to qualify as a nominee
        </CardDescription>
      );
    }
    quorumBar = (
      <ContenderQuorumBar votes={votes} quorumThreshold={quorumThreshold} />
    );
  } else {
    title = "Vote for this Nominee";
    const nomineeData = memberDetails?.nominees.find(
      (n) => n.address.toLowerCase() === address.toLowerCase()
    );
    if (!nomineeData) return null;

    infoSlot = <NomineeInfo nominee={nomineeData} />;

    const isFullWeight =
      memberDetails &&
      currentBlock !== undefined &&
      currentBlock <= BigInt(memberDetails.fullWeightDeadline);

    weightStatus = (
      <div className="flex items-center gap-2 text-sm">
        {isFullWeight ? (
          <span className="text-green-500 text-xs font-medium">
            Full weight voting active
          </span>
        ) : (
          <div className="flex items-center gap-1 text-yellow-500">
            <AlertCircle className="h-3 w-3" />
            <span className="text-xs">
              Vote weight is now decreasing, earlier votes count more
            </span>
          </div>
        )}
      </div>
    );
  }

  return (
    <Card variant="glass">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Vote className="h-5 w-5" />
          {title}
        </CardTitle>
        {description}
      </CardHeader>
      <CardContent className="space-y-4">
        {quorumBar}
        {weightStatus}

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
              governorAddress={governorAddress}
              chainId={chainId}
              availableVotes={availableVotes}
              onVoteSuccess={refetchUsedVotes}
              infoSlot={infoSlot}
              {...(isMemberElection && {
                prepareVote: prepareMemberElectionVote,
              })}
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}

function NomineeInfo({
  nominee,
}: {
  nominee: SerializableMemberNominee;
}): React.ReactElement {
  return (
    <span className="text-xs text-muted-foreground shrink-0">
      #{nominee.rank} · {formatVotingPower(nominee.weightReceived)} weighted
      votes
    </span>
  );
}

function NoVotingPowerWarning(): React.ReactElement {
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

function AllVotesUsedNotice(): React.ReactElement {
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
