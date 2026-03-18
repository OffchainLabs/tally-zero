"use client";

import { useAccount, useBlockNumber } from "wagmi";

import type { SerializableMemberNominee } from "@gzeoneth/gov-tracker";
import {
  memberElectionGovernorReadAbi,
  prepareMemberElectionVote,
} from "@gzeoneth/gov-tracker";
import { AlertCircle, Wallet } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { useElectionContracts } from "@/hooks/use-election-contracts";
import { useElectionVotingPower } from "@/hooks/use-election-voting-power";
import { formatVotingPower } from "@/lib/format-utils";

import { ElectionVoteRow } from "./ElectionVoteRow";
import { VotingPowerSummary } from "./VotingPowerSummary";

interface NomineeVoteFormProps {
  proposalId: string;
  nominees: SerializableMemberNominee[];
  fullWeightDeadline: number;
  bypassSimulation?: boolean;
}

export function NomineeVoteForm({
  proposalId,
  nominees,
  fullWeightDeadline,
  bypassSimulation = false,
}: NomineeVoteFormProps): React.ReactElement {
  const { isConnected } = useAccount();
  const { memberGovernorAddress, chainId } = useElectionContracts();
  const governorAddress = memberGovernorAddress;
  const { data: currentBlock } = useBlockNumber({ watch: true });

  const { totalVotingPower, usedVotes, availableVotes, refetchUsedVotes } =
    useElectionVotingPower({
      proposalId,
      governorAddress,
      governorReadAbi: memberElectionGovernorReadAbi,
    });

  const isFullWeight =
    currentBlock !== undefined && currentBlock <= BigInt(fullWeightDeadline);

  if (!isConnected) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground p-4">
        <Wallet className="h-4 w-4" />
        Connect your wallet to vote for nominees
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      <VotingPowerSummary
        totalVotingPower={totalVotingPower}
        usedVotes={usedVotes}
        availableVotes={availableVotes}
      />

      <div className="flex items-center gap-2 text-sm">
        {isFullWeight ? (
          <Badge
            variant="secondary"
            className="text-green-500 border-green-500/30"
          >
            Full weight voting active
          </Badge>
        ) : (
          <div className="flex items-center gap-1 text-yellow-500">
            <AlertCircle className="h-3 w-3" />
            <span className="text-xs">
              Vote weight is now decreasing — earlier votes count more
            </span>
          </div>
        )}
      </div>

      {nominees.length === 0 ? (
        <div className="text-center text-muted-foreground py-8">
          No nominees available for voting
        </div>
      ) : (
        <div className="space-y-3">
          {nominees.map((nominee) => (
            <ElectionVoteRow
              key={nominee.address}
              proposalId={proposalId}
              targetAddress={nominee.address}
              governorAddress={governorAddress}
              chainId={chainId}
              availableVotes={availableVotes}
              onVoteSuccess={refetchUsedVotes}
              infoSlot={<NomineeInfo nominee={nominee} />}
              bypassSimulation={bypassSimulation}
              prepareVote={prepareMemberElectionVote}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function NomineeInfo({
  nominee,
}: {
  nominee: SerializableMemberNominee;
}): React.ReactElement {
  return (
    <div className="flex items-center gap-2 shrink-0">
      <span className="text-xs text-muted-foreground">
        {formatVotingPower(nominee.weightReceived)} ARB
      </span>
      {nominee.isWinner && (
        <Badge variant="default" className="bg-green-500 text-xs">
          Top 6
        </Badge>
      )}
    </div>
  );
}
