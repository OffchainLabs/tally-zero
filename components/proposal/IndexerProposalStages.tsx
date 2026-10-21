"use client";

import { Button } from "@/components/ui/Button";
import type { GovernorType } from "@/config/governors";
import { useIndexerProposalStages } from "@/hooks/use-indexer-proposal-stages";
import { useVotingPeriod } from "@/hooks/use-voting-period";
import { indexerStageEstimatedCompletion } from "@/lib/indexer-stages";
import { ReloadIcon } from "@radix-ui/react-icons";

import { LoadingSkeleton, StageItem } from "./stages";

export interface IndexerProposalStagesProps {
  proposalId: string;
  governorAddress: string;
  governorType: GovernorType;
  /** Vote start block, for the voting period of an Arbitrum One proposal */
  startBlock?: string;
  /** Scheduled vote end block, likewise */
  endBlock?: string;
}

/**
 * The Lifecycle tab drawn from the indexer's `/stages` endpoint: exactly the
 * stages it returns, in its order, through the same `StageItem` gov-tracker's
 * stages use. There is no per-stage re-trace; refreshing re-reads the endpoint.
 */
export default function IndexerProposalStages({
  proposalId,
  governorAddress,
  governorType,
  startBlock,
  endBlock,
}: IndexerProposalStagesProps) {
  const { data, stages, isLoading, error, refetch } = useIndexerProposalStages({
    proposalId,
    governorAddress,
  });

  // The voting period read is an Arbitrum One governor call; an L1 voting
  // proposal's period is on its own page, in L1 blocks.
  const isL1 = governorType === "l1";
  const { votingPeriod, extensionStillPossible } = useVotingPeriod(
    isL1 ? {} : { proposalId, governorAddress, startBlock, endBlock }
  );

  if (error) {
    return (
      <div className="p-4 text-center glass-subtle backdrop-blur rounded-xl">
        <p className="text-sm text-red-500 mb-3">{error}</p>
        <Button variant="outline" size="sm" onClick={refetch}>
          <ReloadIcon className="mr-2 h-4 w-4" />
          Retry
        </Button>
      </div>
    );
  }

  if (isLoading) {
    return <LoadingSkeleton />;
  }

  if (!data || stages.length === 0) {
    return (
      <p className="p-4 text-sm text-muted-foreground">
        The indexer has no lifecycle stages for this proposal yet.
      </p>
    );
  }

  return (
    <div className="p-4" data-testid="indexer-proposal-stages">
      <div className="mb-4 pb-3 border-b border-border/50">
        <h3 className="text-sm font-semibold">Governance Lifecycle</h3>
        <p className="text-xs text-muted-foreground">
          {data.executionCancelled
            ? "A timelock operation was cancelled"
            : "Stages from the governance indexer"}
        </p>
      </div>

      <div className="relative">
        {stages.map((stage, idx) => (
          // The endpoint's own status, before READY is derived, for e2e checks
          <div
            key={stage.type}
            data-stage-type={stage.type}
            data-stage-status={data.stages[idx].status}
          >
            <StageItem
              stage={stage}
              stageType={stage.type}
              stageIndex={idx}
              isLast={idx === stages.length - 1}
              isTracking={false}
              isLoading={false}
              isRefreshing={false}
              onRefresh={refetch}
              estimatedCompletion={indexerStageEstimatedCompletion(
                data.stages[idx]
              )}
              votingTimeRange={votingPeriod?.range ?? null}
              extensionStillPossible={extensionStillPossible}
              governorType={governorType}
              proposalId={proposalId}
              governorAddress={governorAddress}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
