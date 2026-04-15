"use client";

import Link from "next/link";
import { memo } from "react";
import { z } from "zod";

import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/HoverCard";
import { proposalSchema } from "@/config/schema";
import { useProposalStages } from "@/hooks/use-proposal-stages";
import {
  formatCurrentState,
  formatStageName,
  getEffectiveDisplayState,
  getStateStyle,
} from "@/lib/lifecycle-utils";
import { buildProposalPath } from "@/lib/proposal-url";
import { cn } from "@/lib/utils";
import {
  CheckCircledIcon,
  ClockIcon,
  CrossCircledIcon,
  ReloadIcon,
} from "@radix-ui/react-icons";

interface LifecycleCellProps {
  proposal: z.infer<typeof proposalSchema>;
}

/**
 * LifecycleCell displays the proposal lifecycle status and opens
 * the stages tab when clicked.
 */
export function LifecycleCell({ proposal }: LifecycleCellProps) {
  const normalizedProposalState = proposal.state.toLowerCase();
  const shouldTrackLifecycle =
    !!proposal.creationTxHash &&
    (normalizedProposalState === "pending" ||
      normalizedProposalState === "active" ||
      normalizedProposalState === "succeeded" ||
      normalizedProposalState === "queued");
  const proposalStages = useProposalStages({
    proposalId: proposal.id,
    creationTxHash: proposal.creationTxHash || "",
    governorAddress: proposal.contractAddress,
    enabled: shouldTrackLifecycle,
  });

  // Derive status from proposal stages result
  const status = proposalStages.isQueued
    ? "queued"
    : proposalStages.isLoading
      ? "loading"
      : proposalStages.error
        ? "error"
        : proposalStages.isComplete
          ? "complete"
          : "idle";

  const currentState = proposalStages.result?.currentState || null;
  const { queuePosition, currentStageIndex, stages, isBackgroundRefreshing } =
    proposalStages;
  const stagesHref = buildProposalPath({
    proposalId: proposal.id,
    governorAddress: proposal.contractAddress,
    tab: "stages",
  });

  if (!proposal.creationTxHash) {
    return <span className="text-xs text-muted-foreground">-</span>;
  }

  if (!shouldTrackLifecycle) {
    return (
      <Link
        href={stagesHref}
        className="text-left hover:opacity-80 transition-opacity"
      >
        <StaticLifecycleContent currentState={proposal.state} />
      </Link>
    );
  }

  const content = (
    <LifecycleContent
      status={status}
      currentState={currentState}
      queuePosition={queuePosition}
      currentStageIndex={currentStageIndex}
      stages={stages}
      isBackgroundRefreshing={isBackgroundRefreshing}
      governorAddress={proposal.contractAddress}
    />
  );

  if (status === "idle") {
    return <span className="text-xs text-muted-foreground">-</span>;
  }

  return (
    <Link
      href={stagesHref}
      className="text-left hover:opacity-80 transition-opacity"
    >
      {content}
    </Link>
  );
}

function StaticLifecycleContent({ currentState }: { currentState: string }) {
  const { icon, color } = getStateStyle(currentState);
  const StateIcon = iconMap[icon];

  return (
    <HoverCard>
      <HoverCardTrigger asChild>
        <div className="glass-subtle flex items-center gap-1.5 cursor-help px-2 py-1 rounded-md">
          <StateIcon className={cn("h-3.5 w-3.5 drop-shadow-sm", color)} />
          <span className={cn("text-xs font-medium", color)}>
            {formatCurrentState(currentState)}
          </span>
        </div>
      </HoverCardTrigger>
      <HoverCardContent className="glass w-auto">
        <p className="text-sm">Lifecycle finalized on-chain</p>
        <p className="text-xs text-muted-foreground">Click to view details</p>
      </HoverCardContent>
    </HoverCard>
  );
}

interface LifecycleContentProps {
  status: string;
  currentState: string | null;
  queuePosition: number | null;
  currentStageIndex: number;
  stages: Array<{ type: string; status: string }>;
  isBackgroundRefreshing: boolean;
  governorAddress: string;
}

const LifecycleContent = memo(function LifecycleContent({
  status,
  currentState,
  queuePosition,
  currentStageIndex,
  stages,
  isBackgroundRefreshing,
  governorAddress,
}: LifecycleContentProps) {
  if (status === "queued") {
    return (
      <HoverCard>
        <HoverCardTrigger asChild>
          <div className="glass-subtle flex items-center gap-1.5 cursor-help px-2 py-1 rounded-md">
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

  if (status === "loading") {
    const progress =
      stages.length > 0 ? Math.round((stages.length / 10) * 100) : 0;
    const currentStageName = stages[currentStageIndex]?.type || "Starting...";

    return (
      <HoverCard>
        <HoverCardTrigger asChild>
          <div className="glass-subtle flex items-center gap-1.5 cursor-help px-2 py-1 rounded-md">
            <ReloadIcon className="h-3.5 w-3.5 text-blue-500 animate-spin drop-shadow-sm" />
            <div className="flex flex-col gap-0.5">
              <span className="text-xs font-medium text-blue-600 dark:text-blue-400">
                Tracking
              </span>
              <div className="w-12 h-1 bg-white/30 dark:bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500/80 backdrop-blur-sm transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          </div>
        </HoverCardTrigger>
        <HoverCardContent className="glass w-auto">
          <p className="text-sm">
            Tracking lifecycle ({stages.length}/10 stages)
          </p>
          <p className="text-xs text-muted-foreground">
            Current: {formatStageName(currentStageName)}
          </p>
        </HoverCardContent>
      </HoverCard>
    );
  }

  if (status === "error") {
    return (
      <HoverCard>
        <HoverCardTrigger asChild>
          <div className="glass-subtle flex items-center gap-1.5 cursor-help px-2 py-1 rounded-md border-red-500/20">
            <CrossCircledIcon className="h-3.5 w-3.5 text-red-500 drop-shadow-sm" />
            <span className="text-xs font-medium text-red-600 dark:text-red-400">
              Error
            </span>
          </div>
        </HoverCardTrigger>
        <HoverCardContent className="glass w-auto">
          <p className="text-sm">Failed to track lifecycle</p>
        </HoverCardContent>
      </HoverCard>
    );
  }

  if (status === "complete") {
    // Get effective display state - shows "Stage x/y" for Core proposals still in L1 round-trip
    const { display: stateDisplay, isInProgress } = getEffectiveDisplayState(
      currentState,
      stages as Parameters<typeof getEffectiveDisplayState>[1],
      governorAddress
    );

    // Use different styling for in-progress Core proposals
    const effectiveState = isInProgress ? "pending" : currentState;
    const { icon, color } = getStateStyle(effectiveState);
    const StateIcon = iconMap[icon];

    return (
      <HoverCard>
        <HoverCardTrigger asChild>
          <div className="glass-subtle flex items-center gap-1.5 cursor-help px-2 py-1 rounded-md">
            {isBackgroundRefreshing ? (
              <div className="relative">
                <StateIcon
                  className={cn("h-3.5 w-3.5 drop-shadow-sm", color)}
                />
                <ReloadIcon className="absolute -top-0.5 -right-0.5 h-2 w-2 text-blue-500 animate-spin drop-shadow-sm" />
              </div>
            ) : (
              <StateIcon className={cn("h-3.5 w-3.5 drop-shadow-sm", color)} />
            )}
            <span className={cn("text-xs font-medium", color)}>
              {stateDisplay}
            </span>
          </div>
        </HoverCardTrigger>
        <HoverCardContent className="glass w-auto">
          <p className="text-sm">Lifecycle tracked: {stages.length} stages</p>
          {isInProgress && (
            <p className="text-xs text-yellow-600 dark:text-yellow-400">
              L1 execution in progress
            </p>
          )}
          {isBackgroundRefreshing ? (
            <p className="text-xs text-blue-500">Refreshing in background...</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Click to view details
            </p>
          )}
        </HoverCardContent>
      </HoverCard>
    );
  }

  return null;
});

const iconMap = {
  check: CheckCircledIcon,
  reload: ReloadIcon,
  clock: ClockIcon,
  cross: CrossCircledIcon,
} as const;
