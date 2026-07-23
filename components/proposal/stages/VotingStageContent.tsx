"use client";

import { memo } from "react";

import { TopDelegatesNotVoted } from "@/components/proposal/TopDelegatesNotVoted";
import { Badge } from "@/components/ui/Badge";
import {
  formatEstimatedCompletion,
  type EstimatedTimeRange,
} from "@/lib/date-utils";
import { sumVoteCounts } from "@/lib/vote-utils";
import {
  getStageData,
  type ProposalStage,
  type StageType,
} from "@/types/proposal-stage";
import type { VotingActiveData } from "@gzeoneth/gov-tracker";
import { CalendarIcon } from "@radix-ui/react-icons";

import { QuorumProgressBar } from "./QuorumProgressBar";
import { createStageCalendarUrl, type VotingTimeRange } from "./stage-utils";
import { VoteDistributionBar } from "./VoteDistributionBar";
import { VotingExtensionBadge } from "./VotingExtensionBadge";
import { VotingPeriodPanel } from "./VotingPeriodPanel";

function getVotingData(
  stage: ProposalStage | undefined
): VotingActiveData | null {
  if (!stage) return null;
  return getStageData(stage, "VOTING_ACTIVE");
}

export interface VotingStageContentProps {
  stage?: ProposalStage;
  votingTimeRange?: VotingTimeRange | null;
  /** Whether the +2d late-quorum extension can still occur */
  extensionStillPossible?: boolean;
  estimatedCompletion?: EstimatedTimeRange;
  metadata?: {
    title: string;
    description: string;
    chain: string;
    estimatedDays?: number;
  } | null;
  stageType: StageType;
  proposalId: string;
  governorAddress: string;
}

export const VotingStageContent = memo(function VotingStageContent({
  stage,
  votingTimeRange,
  extensionStillPossible = false,
  estimatedCompletion,
  metadata,
  stageType,
  proposalId,
  governorAddress,
}: VotingStageContentProps) {
  const votingData = getVotingData(stage);
  const votesTowardQuorum = sumVoteCounts(
    String(votingData?.forVotesRaw ?? "0"),
    String(votingData?.abstainVotesRaw ?? "0")
  );

  return (
    <div className="mt-3 space-y-3">
      {votingTimeRange && (
        <VotingPeriodPanel range={votingTimeRange}>
          {Boolean(votingData?.quorumReached) && (
            <Badge
              variant="secondary"
              className="bg-green-500/20 dark:bg-green-500/25 text-green-700 dark:text-green-400 border border-green-500/30 text-xs py-0 px-2"
            >
              Quorum Reached
            </Badge>
          )}
          {Boolean(votingData?.wasExtended) && (
            <Badge
              variant="secondary"
              className="bg-blue-500/20 dark:bg-blue-500/25 text-blue-700 dark:text-blue-400 border border-blue-500/30 text-xs py-0 px-2"
            >
              Extended
            </Badge>
          )}
          {extensionStillPossible && <VotingExtensionBadge />}
        </VotingPeriodPanel>
      )}

      <TopDelegatesNotVoted
        proposalId={proposalId}
        governorAddress={governorAddress}
      />

      {Boolean(votingData?.quorumRaw) && (
        <QuorumProgressBar
          current={votesTowardQuorum}
          required={String(votingData?.quorumRaw)}
          reached={Boolean(votingData?.quorumReached)}
        />
      )}

      {Boolean(votingData?.forVotesRaw) && (
        <VoteDistributionBar
          forVotes={String(votingData?.forVotesRaw)}
          againstVotes={String(votingData?.againstVotesRaw ?? "0")}
          abstainVotes={String(votingData?.abstainVotesRaw ?? "0")}
        />
      )}

      {estimatedCompletion && (
        <div className="text-xs text-blue-600 dark:text-blue-400 flex items-center gap-1.5 glass-subtle backdrop-blur rounded-lg px-3 py-2">
          <span>
            Est. completion: {formatEstimatedCompletion(estimatedCompletion)}
          </span>
          <a
            href={createStageCalendarUrl(
              metadata?.title || stageType,
              estimatedCompletion,
              proposalId
            )}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center p-1 rounded-full hover:bg-blue-500/10 text-muted-foreground hover:text-blue-600 dark:hover:text-blue-400 transition-all duration-200"
            title="Add to Google Calendar"
          >
            <CalendarIcon className="h-3.5 w-3.5" />
          </a>
        </div>
      )}
    </div>
  );
});
