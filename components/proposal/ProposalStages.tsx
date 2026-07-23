"use client";

import { useMemo } from "react";

import { isElectionProposal } from "@gzeoneth/gov-tracker";

import { Button } from "@/components/ui/Button";
import { isTreasuryGovernor } from "@/config/governors";
import { useL1BlockTimestamps } from "@/hooks/use-l1-block-timestamps";
import {
  getAllStageTypes,
  useProposalStages,
} from "@/hooks/use-proposal-stages";
import { useVotingPeriod } from "@/hooks/use-voting-period";
import { buildLookupMap } from "@/lib/collection-utils";
import {
  getStageData,
  type ProposalStage,
  type StageType,
} from "@/types/proposal-stage";
import { ReloadIcon } from "@radix-ui/react-icons";

import {
  calculateEstimatedCompletionTimes,
  getStageEstimatedDays,
  LoadingSkeleton,
  resolveMinedBlockNumbers,
  StageItem,
} from "./stages";

interface ProposalStagesProps {
  proposalId: string;
  creationTxHash: string;
  governorAddress: string;
  l1RpcUrl?: string;
  currentL1Block?: number;
  /** Vote start block from the ProposalCreated event (proposalSnapshot) */
  startBlock?: string;
  /** Scheduled vote end block from the ProposalCreated event */
  endBlock?: string;
}

export default function ProposalStages({
  proposalId,
  creationTxHash,
  governorAddress,
  l1RpcUrl,
  currentL1Block,
  startBlock,
  endBlock,
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

    return allStageTypes
      .filter((meta) => {
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
      })
      .map((meta) => ({
        // gov-tracker reports the 8-day Constitutional L2 timelock for every
        // proposal; override it so treasury (non-Constitutional) proposals use
        // their 3-day L2 waiting period in completion estimates.
        ...meta,
        estimatedDays:
          getStageEstimatedDays(meta.type, meta.estimatedDays, governorType) ??
          meta.estimatedDays,
      }));
  }, [allStageTypes, isDefeated, isTreasuryProposal, isElection, governorType]);

  // Real timestamps for already-mined voting boundary blocks, so past
  // voting dates are exact instead of extrapolated at 12s per block.
  const minedBoundaryBlocks = useMemo(() => {
    const proposalCreatedStage = stageMap.get("PROPOSAL_CREATED");
    const votingStage = stageMap.get("VOTING_ACTIVE");
    const proposalData = proposalCreatedStage
      ? getStageData(proposalCreatedStage, "PROPOSAL_CREATED")
      : null;
    const votingData = votingStage
      ? getStageData(votingStage, "VOTING_ACTIVE")
      : null;

    return resolveMinedBlockNumbers(
      [
        proposalData?.startBlock,
        proposalData?.endBlock,
        votingData?.extendedDeadline,
      ],
      currentL1Block
    );
  }, [stageMap, currentL1Block]);
  const blockTimestamps = useL1BlockTimestamps(minedBoundaryBlocks);

  const { estimatedTimes, votingTimeRange } = calculateEstimatedCompletionTimes(
    relevantStageTypes,
    stageMap,
    currentL1Block,
    blockTimestamps
  );

  // Shared with the vote summary card so both surfaces display identical
  // voting-period data; the gov-tracker-derived range stays as fallback.
  const { votingPeriod, extensionStillPossible } = useVotingPeriod({
    proposalId,
    governorAddress,
    startBlock,
    endBlock,
  });
  const displayVotingTimeRange = votingPeriod?.range ?? votingTimeRange;

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
    <div className="p-4">
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
              votingTimeRange={isDefeated ? null : displayVotingTimeRange}
              extensionStillPossible={!isDefeated && extensionStillPossible}
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
