"use client";

import { useAccount } from "wagmi";

import type { SerializableContender } from "@gzeoneth/gov-tracker";
import { nomineeElectionGovernorReadAbi } from "@gzeoneth/gov-tracker";
import { Wallet } from "lucide-react";

import { useElectionContracts } from "@/hooks/use-election-contracts";
import { useElectionVotingPower } from "@/hooks/use-election-voting-power";
import { formatVotingPower } from "@/lib/format-utils";

import { ElectionVoteRow } from "./ElectionVoteRow";
import { VotingPowerSummary } from "./VotingPowerSummary";

interface ContenderVoteFormProps {
  proposalId: string;
  contenders: SerializableContender[];
  quorumThreshold: string;
  bypassSimulation?: boolean;
}

export function ContenderVoteForm({
  proposalId,
  contenders,
  quorumThreshold,
  bypassSimulation = false,
}: ContenderVoteFormProps): React.ReactElement {
  const { isConnected } = useAccount();
  const { nomineeGovernorAddress, chainId } = useElectionContracts();
  const governorAddress = nomineeGovernorAddress;

  const { totalVotingPower, usedVotes, availableVotes, refetchUsedVotes } =
    useElectionVotingPower({
      proposalId,
      governorAddress,
      governorReadAbi: nomineeElectionGovernorReadAbi,
    });

  if (!isConnected) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground p-4">
        <Wallet className="h-4 w-4" />
        Connect your wallet to vote for contenders
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

      <div className="text-sm text-muted-foreground">
        Quorum threshold: {formatVotingPower(quorumThreshold)} ARB per contender
      </div>

      {contenders.length === 0 ? (
        <div className="text-center text-muted-foreground py-8">
          No contenders registered yet
        </div>
      ) : (
        <div className="space-y-3">
          {contenders.map((contender) => (
            <ElectionVoteRow
              key={contender.address}
              proposalId={proposalId}
              targetAddress={contender.address}
              governorAddress={governorAddress}
              chainId={chainId}
              availableVotes={availableVotes}
              onVoteSuccess={refetchUsedVotes}
              bypassSimulation={bypassSimulation}
            />
          ))}
        </div>
      )}
    </div>
  );
}
