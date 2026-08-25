"use client";

import Link from "next/link";
import { memo } from "react";
import { z } from "zod";

import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/HoverCard";
import { Skeleton } from "@/components/ui/Skeleton";
import { proposalSchema } from "@/config/schema";
import { useProposalLifecycleStatus } from "@/hooks/use-proposal-lifecycle-status";
import {
  formatStageName,
  getStateDotColor,
  getStateStyle,
} from "@/lib/lifecycle-utils";
import { buildProposalPath } from "@/lib/proposal-url";
import { cn } from "@/lib/utils";
import { ClockIcon, ReloadIcon } from "@radix-ui/react-icons";
import { InfoIcon } from "lucide-react";

interface LifecycleCellProps {
  proposal: z.infer<typeof proposalSchema> & {
    /** See `isProposalStateUnverified` in lib/proposal-utils */
    isStateUnverified?: boolean;
  };
}

/**
 * LifecycleCell displays the proposal lifecycle status and opens
 * the stages tab when clicked.
 */
export function LifecycleCell({ proposal }: LifecycleCellProps) {
  const {
    display,
    state,
    isInProgress,
    phaseLabel,
    currentStage,
    totalStages,
    isTracked,
    isQueued,
    queuePosition,
    isLoading,
    stages,
    currentStageIndex,
    isBackgroundRefreshing,
  } = useProposalLifecycleStatus(proposal);

  const stagesHref = buildProposalPath({
    proposalId: proposal.id,
    governorAddress: proposal.contractAddress,
    tab: "stages",
  });

  // The indexer called this vote closed, but a late-quorum extension can leave
  // it open on-chain. Hold the status back rather than show one that is about to
  // be overturned by the governor.
  if (proposal.isStateUnverified) {
    return <UnverifiedLifecycleContent />;
  }

  // Tracking is queued behind other proposals and has nothing to show yet, so
  // say so instead of rendering a status no trace has confirmed. Still a link:
  // every other state in this cell opens the stages tab, and waiting for a
  // tracking slot is no reason to make the row the one dead spot in the column.
  if (isQueued) {
    return (
      <Link
        href={stagesHref}
        className="text-left hover:opacity-80 transition-opacity"
      >
        <QueuedLifecycleContent queuePosition={queuePosition} />
      </Link>
    );
  }

  return (
    <Link
      href={stagesHref}
      className="text-left hover:opacity-80 transition-opacity"
    >
      <LifecycleContent
        display={display}
        state={state}
        isInProgress={isInProgress}
        phaseLabel={phaseLabel}
        currentStage={currentStage}
        totalStages={totalStages}
        isTracked={isTracked}
        isLoading={isLoading}
        stageCount={stages.length}
        currentStageName={stages[currentStageIndex]?.type ?? null}
        isBackgroundRefreshing={isBackgroundRefreshing}
      />
    </Link>
  );
}

/**
 * Placeholder shown while a proposal's indexed status is being confirmed against
 * the governor contract.
 */
function UnverifiedLifecycleContent() {
  return (
    <HoverCard>
      <HoverCardTrigger asChild>
        <div className="inline-flex items-center gap-1.5 cursor-help">
          <ReloadIcon className="h-3 w-3 shrink-0 animate-spin text-muted-foreground/60" />
          <Skeleton className="h-3 w-14" />
        </div>
      </HoverCardTrigger>
      <HoverCardContent className="glass w-auto">
        <p className="text-sm">Confirming status on-chain</p>
        <p className="text-xs text-muted-foreground">
          Waiting for the governor to confirm before showing a status.
        </p>
      </HoverCardContent>
    </HoverCard>
  );
}

function QueuedLifecycleContent({
  queuePosition,
}: {
  queuePosition: number | null;
}) {
  return (
    <HoverCard>
      <HoverCardTrigger asChild>
        <div className="glass-subtle backdrop-blur flex items-center gap-1.5 cursor-help px-2 py-1 rounded-md">
          <ClockIcon className="h-3.5 w-3.5 text-yellow-500 drop-shadow-sm" />
          <span className="text-xs font-medium text-yellow-600 dark:text-yellow-400">
            Queue #{queuePosition}
          </span>
        </div>
      </HoverCardTrigger>
      <HoverCardContent className="glass w-auto">
        <p className="text-sm">Waiting in queue (position {queuePosition})</p>
        <p className="text-xs text-muted-foreground">
          Max 2 proposals tracked concurrently
        </p>
      </HoverCardContent>
    </HoverCard>
  );
}

interface LifecycleContentProps {
  display: string;
  state: string;
  isInProgress: boolean;
  phaseLabel: string | null;
  currentStage: number | null;
  totalStages: number;
  isTracked: boolean;
  isLoading: boolean;
  stageCount: number;
  currentStageName: string | null;
  isBackgroundRefreshing: boolean;
}

const LifecycleContent = memo(function LifecycleContent({
  display,
  state,
  isInProgress,
  phaseLabel,
  currentStage,
  totalStages,
  isTracked,
  isLoading,
  stageCount,
  currentStageName,
  isBackgroundRefreshing,
}: LifecycleContentProps) {
  const { color } = getStateStyle(state);
  const dotColor = getStateDotColor(state);
  const isWorking = isLoading || isBackgroundRefreshing;

  return (
    <HoverCard>
      <HoverCardTrigger asChild>
        <div className="inline-flex items-center gap-1.5 cursor-help">
          <span className="relative flex shrink-0">
            <span className={cn("h-2 w-2 rounded-full", dotColor)} />
            {isWorking && (
              <ReloadIcon className="absolute -top-1 -right-1 h-2 w-2 text-blue-500 animate-spin drop-shadow-sm" />
            )}
          </span>
          <span className={cn("text-xs font-medium", color)}>{display}</span>
          <InfoIcon className="h-3.5 w-3.5 text-muted-foreground/50" />
        </div>
      </HoverCardTrigger>
      <HoverCardContent className="glass w-auto">
        {isInProgress ? (
          <p className="text-sm">
            Executed on the governor, still moving through the timelocks
          </p>
        ) : isTracked ? (
          <p className="text-sm">Lifecycle tracked: {stageCount} stages</p>
        ) : (
          <p className="text-sm">Lifecycle finalized on-chain</p>
        )}
        {phaseLabel && currentStage !== null && (
          <p className="text-xs text-muted-foreground">
            Stage {currentStage}/{totalStages} · {phaseLabel}
          </p>
        )}
        {isLoading ? (
          <p className="text-xs text-blue-500">
            {currentStageName
              ? `Reading ${formatStageName(currentStageName)}...`
              : "Reading stages from the chain..."}
          </p>
        ) : isBackgroundRefreshing ? (
          <p className="text-xs text-blue-500">Refreshing in background...</p>
        ) : (
          <p className="text-xs text-muted-foreground">Click to view details</p>
        )}
      </HoverCardContent>
    </HoverCard>
  );
});
