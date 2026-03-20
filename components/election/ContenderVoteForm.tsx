"use client";

import { useAccount } from "wagmi";

import type {
  SerializableContender,
  SerializableNominee,
} from "@gzeoneth/gov-tracker";
import { nomineeElectionGovernorReadAbi } from "@gzeoneth/gov-tracker";
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Info,
  Wallet,
} from "lucide-react";

import { Badge } from "@/components/ui/Badge";

import { useElectionContracts } from "@/hooks/use-election-contracts";
import { useElectionVotingPower } from "@/hooks/use-election-voting-power";
import { formatVotingPower } from "@/lib/format-utils";

import { ElectionVoteRow } from "./ElectionVoteRow";
import { VotingPowerSummary } from "./VotingPowerSummary";

interface ContenderVoteFormProps {
  proposalId: string;
  contenders: SerializableContender[];
  quorumThreshold: string;
  nominees?: SerializableNominee[];
  bypassSimulation?: boolean;
}

function ContenderQuorumInfo({
  address,
  nominees,
  quorumThreshold,
}: {
  address: string;
  nominees: SerializableNominee[];
  quorumThreshold: string;
}): React.ReactElement {
  const nomineeData = nominees.find(
    (n) => n.address.toLowerCase() === address.toLowerCase()
  );
  const votes = nomineeData?.votesReceived ?? "0";
  const qualified =
    BigInt(votes) >= BigInt(quorumThreshold) &&
    BigInt(quorumThreshold) > BigInt(0);

  return (
    <div className="flex items-center gap-2 shrink-0">
      <span className="text-xs text-muted-foreground">
        {formatVotingPower(votes)} ARB
      </span>
      {qualified ? (
        <Badge
          variant="secondary"
          className="text-green-500 border-green-500/30 text-xs"
        >
          Qualified
        </Badge>
      ) : (
        <Badge variant="outline" className="text-xs">
          Needs {formatVotingPower(quorumThreshold)} ARB
        </Badge>
      )}
    </div>
  );
}

export function ContenderVoteForm({
  proposalId,
  contenders,
  quorumThreshold,
  nominees,
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
      <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-3">
        <div className="flex items-start gap-2 text-blue-500">
          <Info className="h-4 w-4 mt-0.5 shrink-0" />
          <div className="text-sm">
            <p className="font-medium">Nominee Selection</p>
            <p className="text-blue-500/80 mt-1">
              Vote for contenders to endorse them as nominees. Each contender
              needs at least {formatVotingPower(quorumThreshold)} ARB (0.2% of
              votable tokens) to qualify for the compliance check.
            </p>
            <a
              href="https://docs.arbitrum.foundation/dao-constitution#section-4-security-council-elections"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 mt-2 text-blue-400 hover:text-blue-300 transition-colors"
            >
              <span>Read the election rules in the DAO Constitution</span>
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
      </div>

      <VotingPowerSummary
        totalVotingPower={totalVotingPower}
        usedVotes={usedVotes}
        availableVotes={availableVotes}
      />

      {totalVotingPower !== undefined && totalVotingPower === BigInt(0) && (
        <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3">
          <div className="flex items-start gap-2 text-yellow-500">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <div className="text-sm">
              <p className="font-medium">No voting power</p>
              <p className="text-yellow-500/80 mt-1">
                Your wallet has no voting power for this election. Voting power
                is based on delegated ARB tokens at the proposal snapshot block.
              </p>
            </div>
          </div>
        </div>
      )}

      {availableVotes !== undefined &&
        availableVotes === BigInt(0) &&
        usedVotes !== undefined &&
        usedVotes > BigInt(0) && (
          <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-3">
            <div className="flex items-center gap-2 text-green-500">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span className="text-sm">
                You have used all your voting power for this round.
              </span>
            </div>
          </div>
        )}

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
              infoSlot={
                nominees ? (
                  <ContenderQuorumInfo
                    address={contender.address}
                    nominees={nominees}
                    quorumThreshold={quorumThreshold}
                  />
                ) : undefined
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
