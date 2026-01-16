"use client";

import {
  getTxUrl,
  type StageType,
  type TrackedStage,
} from "@gzeoneth/gov-tracker";
import {
  CheckCircle2,
  Circle,
  Clock,
  ExternalLink,
  ListTree,
} from "lucide-react";

import { Button } from "@/components/ui/Button";
import { useDeepLink } from "@/context/DeepLinkContext";

import { PHASE_METADATA } from "@/config/security-council";
import { cn } from "@/lib/utils";
import type { ElectionPhase } from "@/types/election";

interface ElectionPhaseTimelineProps {
  currentPhase: ElectionPhase;
  stages?: TrackedStage[];
  className?: string;
}

const PHASE_TO_STAGE_TYPES: Record<ElectionPhase, StageType[]> = {
  NOT_STARTED: [],
  NOMINEE_SELECTION: ["CREATE_ELECTION", "NOMINEE_ELECTION"],
  VETTING_PERIOD: ["NOMINEE_VETTING"],
  MEMBER_ELECTION: ["MEMBER_ELECTION"],
  PENDING_EXECUTION: [
    "L2_TIMELOCK",
    "L2_TO_L1_MESSAGE",
    "L1_TIMELOCK",
    "RETRYABLE_EXECUTED",
  ],
  COMPLETED: [],
};

function getTransactionsForPhase(
  phase: ElectionPhase,
  stages?: TrackedStage[]
): { hash: string; chainId: number }[] {
  if (!stages) return [];
  const stageTypes = PHASE_TO_STAGE_TYPES[phase];
  if (!stageTypes.length) return [];

  const transactions: { hash: string; chainId: number }[] = [];
  for (const stage of stages) {
    if (stageTypes.includes(stage.type)) {
      for (const tx of stage.transactions) {
        transactions.push({ hash: tx.hash, chainId: tx.chainId });
      }
    }
  }
  return transactions;
}

const TIMELINE_PHASES: ElectionPhase[] = [
  "NOMINEE_SELECTION",
  "VETTING_PERIOD",
  "MEMBER_ELECTION",
  "PENDING_EXECUTION",
];

function getPhaseIndex(phase: ElectionPhase): number {
  if (phase === "NOT_STARTED") return -1;
  if (phase === "COMPLETED") return TIMELINE_PHASES.length;
  return TIMELINE_PHASES.indexOf(phase);
}

function getL2TimelockTxHash(stages?: TrackedStage[]): string | null {
  if (!stages) return null;
  const l2TimelockStage = stages.find((s) => s.type === "L2_TIMELOCK");
  if (!l2TimelockStage?.transactions?.length) return null;
  return l2TimelockStage.transactions[0].hash;
}

export function ElectionPhaseTimeline({
  currentPhase,
  stages,
  className,
}: ElectionPhaseTimelineProps): React.ReactElement {
  const { openTimelock } = useDeepLink();
  const currentIndex = getPhaseIndex(currentPhase);
  const timelockTxHash = getL2TimelockTxHash(stages);

  return (
    <div className={cn("space-y-4", className)}>
      <h3 className="text-lg font-semibold">Election Timeline</h3>

      <div className="relative">
        {TIMELINE_PHASES.map((phase, index) => {
          const metadata = PHASE_METADATA[phase];
          const isCompleted = index < currentIndex;
          const isActive = index === currentIndex;
          const isFuture = index > currentIndex;

          return (
            <div key={phase} className="flex items-start gap-4 pb-8 last:pb-0">
              <div className="relative flex flex-col items-center">
                <PhaseIcon isCompleted={isCompleted} isActive={isActive} />
                {index < TIMELINE_PHASES.length - 1 && (
                  <div
                    className={cn(
                      "absolute top-8 h-full w-0.5",
                      isCompleted ? "bg-green-500" : "bg-border"
                    )}
                  />
                )}
              </div>

              <div className="flex-1 pt-0.5">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "font-medium",
                      isCompleted && "text-green-500",
                      isActive && "text-primary",
                      isFuture && "text-muted-foreground"
                    )}
                  >
                    {metadata.name}
                  </span>
                  {metadata.durationDays > 0 && (
                    <span className="text-xs text-muted-foreground">
                      ({metadata.durationDays} days)
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {metadata.description}
                </p>
                <PhaseTransactionLinks phase={phase} stages={stages} />
              </div>
            </div>
          );
        })}
      </div>

      {currentPhase === "COMPLETED" && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/10 p-3 text-green-500">
            <CheckCircle2 className="h-5 w-5" />
            <span className="font-medium">Election Completed</span>
          </div>
          {timelockTxHash && (
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => openTimelock(timelockTxHash)}
            >
              <ListTree className="h-4 w-4 mr-2" />
              View Execution Details
            </Button>
          )}
        </div>
      )}

      {currentPhase === "NOT_STARTED" && (
        <div className="flex items-center gap-2 rounded-lg border border-border/50 bg-muted/30 p-3 text-muted-foreground">
          <Clock className="h-5 w-5" />
          <span>No active election</span>
        </div>
      )}
    </div>
  );
}

function PhaseTransactionLinks({
  phase,
  stages,
}: {
  phase: ElectionPhase;
  stages?: TrackedStage[];
}): React.ReactElement | null {
  const transactions = getTransactionsForPhase(phase, stages);
  if (transactions.length === 0) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {transactions.map((tx) => (
        <a
          key={tx.hash}
          href={getTxUrl(tx.chainId, tx.hash)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 rounded bg-muted/50 px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <span className="font-mono">
            {tx.hash.slice(0, 6)}...{tx.hash.slice(-4)}
          </span>
          <ExternalLink className="h-3 w-3" />
        </a>
      ))}
    </div>
  );
}

function PhaseIcon({
  isCompleted,
  isActive,
}: {
  isCompleted: boolean;
  isActive: boolean;
}): React.ReactElement {
  if (isCompleted) {
    return (
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-500 text-white">
        <CheckCircle2 className="h-5 w-5" />
      </div>
    );
  }

  if (isActive) {
    return (
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
        <Circle className="h-5 w-5 fill-current" />
      </div>
    );
  }

  return (
    <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-border bg-background">
      <Circle className="h-5 w-5 text-muted-foreground" />
    </div>
  );
}
