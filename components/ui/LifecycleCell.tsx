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
import { ReloadIcon } from "@radix-ui/react-icons";
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
    isResolving,
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

  // Nothing settled yet. A status arrived at in steps reads as three different
  // answers ("Queued", then "Executed", then "Executing") rather than as one
  // being refined, so show a placeholder until the chain has the last word.
  // Covers both halves of the wait: the indexed state being re-read from the
  // governor, and the stage trace that separates Executing from Executed.
  if (proposal.isStateUnverified || isResolving) {
    return (
      <Link
        href={stagesHref}
        className="text-left hover:opacity-80 transition-opacity"
      >
        <ResolvingLifecycleContent
          queuePosition={isQueued ? queuePosition : null}
        />
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
 * Placeholder shown while a proposal's status is still being read from the
 * chain. The queue position, when there is one, stays in the hover card: it
 * explains a wait, and is not a status.
 */
function ResolvingLifecycleContent({
  queuePosition,
}: {
  queuePosition: number | null;
}) {
  return (
    <HoverCard>
      <HoverCardTrigger asChild>
        <div className="inline-flex items-center gap-1.5 cursor-help">
          <ReloadIcon className="h-3 w-3 shrink-0 animate-spin text-muted-foreground/60" />
          <Skeleton className="h-3 w-14" />
        </div>
      </HoverCardTrigger>
      <HoverCardContent className="glass w-auto">
        <p className="text-sm">Reading status from the chain</p>
        <p className="text-xs text-muted-foreground">
          {queuePosition !== null
            ? `Waiting for a tracking slot (position ${queuePosition}, two proposals at a time).`
            : "Waiting for the governor and the lifecycle stages to agree before showing a status."}
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
