"use client";

import { useMemo } from "react";

import { isElectionProposal } from "@gzeoneth/gov-tracker";

import { Button } from "@/components/ui/Button";
import { isTreasuryGovernor } from "@/config/governors";
import {
  getAllStageTypes,
  useProposalStages,
} from "@/hooks/use-proposal-stages";
import { buildLookupMap } from "@/lib/collection-utils";
import type { ProposalStage, StageType } from "@/types/proposal-stage";
import { ReloadIcon } from "@radix-ui/react-icons";

import {
  calculateEstimatedCompletionTimes,
  LoadingSkeleton,
  StageItem,
} from "./stages";

interface ProposalStagesProps {
  proposalId: string;
  creationTxHash: string;
  governorAddress: string;
  l1RpcUrl?: string;
  currentL1Block?: number;
}

export default function ProposalStages({
  proposalId,
  creationTxHash,
  governorAddress,
  l1RpcUrl,
  currentL1Block,
}: ProposalStagesProps) {
  const {
    stages,
    currentStageIndex,
    isLoading,
    isQueued,
    queuePosition,
    isComplete,
    error,
    result,
    refetchFromStage,
    refreshingFromIndex,
  } = useProposalStages({
    proposalId,
    creationTxHash,
    governorAddress,
    enabled: true,
    l1RpcUrl,
    currentL1Block,
  });

  const isTreasuryProposal = isTreasuryGovernor(governorAddress);
  const governorType = isTreasuryProposal ? "treasury" : "core";

  const allStageTypes = getAllStageTypes();
  const stageMap = useMemo(
    () => buildLookupMap(stages, (s) => s.type),
    [stages]
  ) as Map<StageType, ProposalStage>;

  const isDefeated = result?.currentState?.toLowerCase() === "defeated";
  const isElection = result?.proposalType
    ? isElectionProposal(result.proposalType)
    : false;

  const relevantStageTypes = useMemo(() => {
    // Election stage types to filter out for non-election proposals
    const electionStageTypes: StageType[] = [
      "CREATE_ELECTION",
      "NOMINEE_ELECTION",
      "NOMINEE_VETTING",
      "MEMBER_ELECTION",
    ];

    // Pre-compute index map for O(1) lookups instead of repeated findIndex calls
    const stageTypeToIndex = new Map(
      allStageTypes.map((s, idx) => [s.type, idx])
    );
    const votingIdx = stageTypeToIndex.get("VOTING_ACTIVE") ?? -1;
    const l2ExecutedIdx = stageTypeToIndex.get("L2_TIMELOCK") ?? -1;

    return allStageTypes.filter((meta) => {
      // Filter out election stages for non-election proposals
      if (!isElection && electionStageTypes.includes(meta.type)) {
        return false;
      }

      const currentIdx = stageTypeToIndex.get(meta.type) ?? -1;

      if (isDefeated) {
        return currentIdx <= votingIdx;
      }
      if (isTreasuryProposal) {
        return currentIdx <= l2ExecutedIdx;
      }
      return true;
    });
  }, [allStageTypes, isDefeated, isTreasuryProposal, isElection]);

  const { estimatedTimes, votingTimeRange } = calculateEstimatedCompletionTimes(
    relevantStageTypes,
    stageMap,
    currentL1Block
  );

  if (error) {
    return (
      <div className="p-4 text-center glass-subtle backdrop-blur rounded-xl">
        <p className="text-sm text-red-500 mb-3">{error}</p>
        <Button variant="outline" size="sm" onClick={() => refetchFromStage(0)}>
          <ReloadIcon className="mr-2 h-4 w-4" />
          Retry
        </Button>
      </div>
    );
  }

  if (isQueued) {
    return (
      <div className="p-4 text-center glass-subtle backdrop-blur rounded-xl">
        <div className="flex items-center justify-center gap-2 mb-2">
          <ReloadIcon className="h-4 w-4 text-yellow-500 animate-spin" />
          <span className="text-sm text-yellow-600 dark:text-yellow-400 font-medium">
            Waiting in queue (position #{queuePosition})
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          Max 2 proposals tracked concurrently. Will start automatically.
        </p>
      </div>
    );
  }

  if (stages.length === 0 && isLoading) {
    return <LoadingSkeleton />;
  }

  return (
    <div className="glass rounded-xl p-4">
      {/* Header */}
      <div className="mb-4 pb-3 border-b border-border/50">
        <h3 className="text-sm font-semibold">Governance Lifecycle</h3>
        {result?.currentState && (
          <p className="text-xs text-muted-foreground">
            Current state: {result.currentState}
          </p>
        )}
      </div>

      <div className="relative">
        {relevantStageTypes.map((meta, idx) => {
          const stage = stageMap.get(meta.type);
          const isTrackingThis =
            isLoading && !isComplete && idx === currentStageIndex + 1;
          const isRefreshingThis =
            refreshingFromIndex !== null && idx >= refreshingFromIndex;
          const estimatedCompletion = estimatedTimes.get(meta.type);

          return (
            <StageItem
              key={meta.type}
              stage={stage}
              stageType={meta.type}
              stageIndex={idx}
              isLast={idx === relevantStageTypes.length - 1}
              isTracking={isTrackingThis}
              isLoading={isLoading}
              isRefreshing={isRefreshingThis && isLoading}
              onRefresh={refetchFromStage}
              estimatedCompletion={isDefeated ? undefined : estimatedCompletion}
              votingTimeRange={isDefeated ? null : votingTimeRange}
              governorType={governorType}
              proposalId={proposalId}
              governorAddress={governorAddress}
            />
          );
        })}
      </div>
    </div>
  );
}
