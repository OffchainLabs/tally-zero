"use client";

import { memo } from "react";

import { TopDelegatesNotVoted } from "@/components/proposal/TopDelegatesNotVoted";
import { Badge } from "@/components/ui/Badge";
import {
  formatDateRange,
  formatDateShort,
  formatEstimatedCompletion,
  type EstimatedTimeRange,
} from "@/lib/date-utils";
import type { ProposalStage, StageType } from "@/types/proposal-stage";
import type { VotingActiveData } from "@gzeoneth/gov-tracker";
import { CalendarIcon } from "@radix-ui/react-icons";

import { QuorumProgressBar } from "./QuorumProgressBar";
import { createStageCalendarUrl, type VotingTimeRange } from "./stage-utils";
import { VoteDistributionBar } from "./VoteDistributionBar";

function getVotingData(
  stage: ProposalStage | undefined
): VotingActiveData | null {
  if (!stage?.data) return null;
  if (stage.type === "VOTING_ACTIVE") return stage.data;
  return null;
}

export interface VotingStageContentProps {
  stage?: ProposalStage;
  votingTimeRange?: VotingTimeRange | null;
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
  estimatedCompletion,
  metadata,
  stageType,
  proposalId,
  governorAddress,
}: VotingStageContentProps) {
  const votingData = getVotingData(stage);

  return (
    <div className="mt-3 space-y-3">
      {votingTimeRange && (
        <div className="space-y-2 glass-subtle rounded-lg px-3 py-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-muted-foreground">
              Voting Period
            </span>
            <span className="text-foreground">
              {formatDateShort(votingTimeRange.votingStartDate)} →{" "}
              {votingData?.extensionPossible === false
                ? formatDateShort(votingTimeRange.votingEndMaxDate)
                : formatDateRange(
                    votingTimeRange.votingEndMinDate,
                    votingTimeRange.votingEndMaxDate
                  )}
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
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
            {Boolean(
              votingData?.extensionPossible !== false &&
                !votingData?.wasExtended
            ) && (
              <Badge
                variant="outline"
                className="text-xs py-0 px-2 glass-subtle"
              >
                +2d extension possible
              </Badge>
            )}
          </div>
        </div>
      )}

      <TopDelegatesNotVoted
        proposalId={proposalId}
        governorAddress={governorAddress}
      />

      {Boolean(votingData?.quorum) && (
        <QuorumProgressBar
          current={String(votingData?.forVotes ?? "0")}
          required={String(votingData?.quorum)}
          reached={Boolean(votingData?.quorumReached)}
        />
      )}

      {Boolean(votingData?.forVotes) && (
        <VoteDistributionBar
          forVotes={String(votingData?.forVotes)}
          againstVotes={String(votingData?.againstVotes ?? "0")}
          abstainVotes={String(votingData?.abstainVotes ?? "0")}
        />
      )}

      {estimatedCompletion && (
        <div className="text-xs text-blue-600 dark:text-blue-400 flex items-center gap-1.5 glass-subtle rounded-lg px-3 py-2">
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
