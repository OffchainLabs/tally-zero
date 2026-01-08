"use client";

import { memo } from "react";

import {
  formatEstimatedCompletion,
  type EstimatedTimeRange,
} from "@/lib/date-utils";
import { cn } from "@/lib/utils";
import type { ProposalStage, StageType } from "@/types/proposal-stage";
import { getStageMetadata } from "@gzeoneth/gov-tracker";
import { CalendarIcon, ReloadIcon } from "@radix-ui/react-icons";

import { createStageCalendarUrl, type VotingTimeRange } from "./stage-utils";
import { StageDataDisplay } from "./StageDataDisplay";
import { StatusIcon } from "./StatusIcon";
import { TransactionsList } from "./TransactionsList";
import { VotingStageContent } from "./VotingStageContent";

export interface StageItemProps {
  stage?: ProposalStage;
  stageType: StageType;
  stageIndex: number;
  isLast: boolean;
  isTracking: boolean;
  isLoading: boolean;
  isRefreshing: boolean;
  onRefresh: (index: number) => void;
  estimatedCompletion?: EstimatedTimeRange;
  votingTimeRange?: VotingTimeRange | null;
  governorType: "core" | "treasury";
  proposalId: string;
  governorAddress: string;
}

export const StageItem = memo(function StageItem({
  stage,
  stageType,
  stageIndex,
  isLast,
  isTracking,
  isLoading,
  isRefreshing,
  onRefresh,
  estimatedCompletion,
  votingTimeRange,
  governorType,
  proposalId,
  governorAddress,
}: StageItemProps) {
  // Note: governorType ("core"/"treasury") maps to ProposalType conceptually
  // but getStageMetadata's second param is optional, so we omit it
  const metadata = getStageMetadata(stageType);
  const status = stage?.status || "NOT_STARTED";
  const isActive = isTracking && !stage;
  const canRefresh = Boolean(stage && !isLoading);

  return (
    <div className="relative flex gap-4">
      {/* Timeline line */}
      {!isLast && (
        <div
          className={cn(
            "absolute left-[14px] top-8 w-0.5 h-[calc(100%-16px)]",
            status === "COMPLETED"
              ? "bg-gradient-to-b from-green-500 to-green-500/50"
              : "bg-gradient-to-b from-muted to-muted/30"
          )}
        />
      )}

      {/* Status icon */}
      <div className="relative z-10 flex-shrink-0 mt-0.5">
        <div
          className={cn(
            "rounded-full p-1",
            status === "COMPLETED"
              ? "bg-green-500/20 dark:bg-green-500/25"
              : status === "PENDING"
                ? "bg-yellow-500/20 dark:bg-yellow-500/25"
                : "glass-subtle"
          )}
        >
          {isActive || isRefreshing ? (
            <ReloadIcon className="h-5 w-5 text-blue-500 animate-spin" />
          ) : (
            <StatusIcon status={status} />
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 pb-6">
        <StageHeader
          metadata={metadata}
          stageType={stageType}
          status={status}
          isRefreshing={isRefreshing}
          canRefresh={canRefresh}
          stageIndex={stageIndex}
          onRefresh={onRefresh}
        />

        <p className="text-xs text-muted-foreground mt-0.5">
          {metadata?.description}
        </p>

        {/* Voting stage specific content */}
        {stageType === "VOTING_ACTIVE" && (
          <VotingStageContent
            stage={stage}
            votingTimeRange={votingTimeRange}
            estimatedCompletion={estimatedCompletion}
            metadata={metadata}
            stageType={stageType}
            proposalId={proposalId}
            governorAddress={governorAddress}
          />
        )}

        {/* Estimated completion for non-voting stages */}
        {status !== "COMPLETED" &&
          stageType !== "VOTING_ACTIVE" &&
          (estimatedCompletion || metadata?.estimatedDays) && (
            <EstimatedCompletionDisplay
              metadata={metadata}
              estimatedCompletion={estimatedCompletion}
              stageType={stageType}
              proposalId={proposalId}
            />
          )}

        {/* Transactions */}
        {stage?.transactions && stage.transactions.length > 0 && (
          <TransactionsList transactions={stage.transactions} />
        )}

        {/* Stage data */}
        {stage?.data && <StageDataDisplay data={stage.data} />}
      </div>
    </div>
  );
});

interface StageHeaderProps {
  metadata?: {
    title: string;
    description: string;
    chain: string;
    estimatedDays?: number;
  } | null;
  stageType: StageType;
  status: string;
  isRefreshing: boolean;
  canRefresh: boolean;
  stageIndex: number;
  onRefresh: (index: number) => void;
}

const StageHeader = memo(function StageHeader({
  metadata,
  stageType,
  status,
  isRefreshing,
  canRefresh,
  stageIndex,
  onRefresh,
}: StageHeaderProps) {
  return (
    <div className="flex items-center gap-2">
      <h4
        className={cn(
          "text-sm font-medium",
          status === "COMPLETED"
            ? "text-foreground"
            : status === "PENDING"
              ? "text-yellow-600 dark:text-yellow-400"
              : "text-muted-foreground"
        )}
      >
        {metadata?.title || stageType}
      </h4>
      <span
        className={cn(
          "text-xs px-2 py-0.5 rounded-full font-medium",
          metadata?.chain === "ethereum"
            ? "bg-blue-500/20 dark:bg-blue-500/25 text-blue-700 dark:text-blue-300"
            : metadata?.chain === "arb1"
              ? "bg-purple-500/20 dark:bg-purple-500/25 text-purple-700 dark:text-purple-300"
              : "bg-orange-500/20 dark:bg-orange-500/25 text-orange-700 dark:text-orange-300"
        )}
      >
        {metadata?.chain === "ethereum"
          ? "L1"
          : metadata?.chain === "arb1"
            ? "Arb1"
            : metadata?.chain === "nova"
              ? "Nova"
              : metadata?.chain}
      </span>
      {isRefreshing && (
        <span className="text-xs text-blue-500 animate-pulse">
          Refreshing...
        </span>
      )}
      {canRefresh && (
        <button
          onClick={() => onRefresh(stageIndex)}
          className="p-1 rounded-full glass-subtle hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-all duration-200"
          title="Re-track from this stage"
        >
          <ReloadIcon className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
});

interface EstimatedCompletionDisplayProps {
  metadata?: {
    title: string;
    description: string;
    chain: string;
    estimatedDays?: number;
  } | null;
  estimatedCompletion?: EstimatedTimeRange;
  stageType: StageType;
  proposalId: string;
}

const EstimatedCompletionDisplay = memo(function EstimatedCompletionDisplay({
  metadata,
  estimatedCompletion,
  stageType,
  proposalId,
}: EstimatedCompletionDisplayProps) {
  return (
    <div className="text-xs text-muted-foreground mt-2 space-y-1 glass-subtle rounded-lg px-3 py-2">
      {metadata?.estimatedDays !== undefined && metadata.estimatedDays > 0 && (
        <p className="italic">
          Est. duration: {metadata.estimatedDays} day
          {metadata.estimatedDays !== 1 ? "s" : ""}
        </p>
      )}
      {estimatedCompletion && (
        <p className="text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
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
        </p>
      )}
    </div>
  );
});
