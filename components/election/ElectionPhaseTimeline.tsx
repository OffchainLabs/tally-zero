"use client";

import { useEffect, useState } from "react";

import {
  ELECTION_TIMING,
  getTxUrl,
  nomineeElectionGovernorReadAbi,
  type ElectionStatus,
  type TrackedStage,
} from "@gzeoneth/gov-tracker";
import {
  Calendar,
  CheckCircle2,
  Circle,
  Clock,
  ExternalLink,
  ListTree,
} from "lucide-react";
import { useReadContract } from "wagmi";

import { Button } from "@/components/ui/Button";
import { useDeepLink } from "@/context/DeepLinkContext";
import { useElectionContracts } from "@/hooks/use-election-contracts";
import { useRpcSettings } from "@/hooks/use-rpc-settings";
import { getOrCreateProvider } from "@/lib/rpc-utils";

import {
  formatDuration,
  PHASE_METADATA,
  PHASE_TO_STAGE_TYPES,
} from "@/config/security-council";
import { cn } from "@/lib/utils";
import type { ElectionPhase } from "@/types/election";

interface ElectionPhaseTimelineProps {
  currentPhase: ElectionPhase;
  stages?: TrackedStage[];
  status?: ElectionStatus | null;
  electionIndex?: number;
  className?: string;
}

interface PhaseTransaction {
  hash: string;
  chainId: number;
  timestamp?: number;
}

function getTransactionsForPhase(
  phase: ElectionPhase,
  stages?: TrackedStage[]
): PhaseTransaction[] {
  if (!stages) return [];
  const stageTypes = PHASE_TO_STAGE_TYPES[phase];
  if (!stageTypes.length) return [];

  // For PENDING_EXECUTION, only show the final execution transaction (L2_TIMELOCK)
  // Security Council elections execute on L2, so we only need the L2 timelock execution
  if (phase === "PENDING_EXECUTION") {
    const l2TimelockStage = stages.find((s) => s.type === "L2_TIMELOCK");
    if (l2TimelockStage?.transactions?.length) {
      const tx = l2TimelockStage.transactions[0];
      return [{ hash: tx.hash, chainId: tx.chainId, timestamp: tx.timestamp }];
    }
    return [];
  }

  const transactions: PhaseTransaction[] = [];
  for (const stage of stages) {
    if (stageTypes.includes(stage.type)) {
      for (const tx of stage.transactions) {
        transactions.push({
          hash: tx.hash,
          chainId: tx.chainId,
          timestamp: tx.timestamp,
        });
      }
    }
  }
  return transactions;
}

const TIMELINE_PHASES: ElectionPhase[] = [
  "CONTENDER_SUBMISSION",
  "NOMINEE_SELECTION",
  "VETTING_PERIOD",
  "MEMBER_ELECTION",
  "PENDING_EXECUTION",
];

function useFetchMissingTimestamps(
  stages: TrackedStage[] | undefined,
  l2RpcUrl: string
): Map<string, number> {
  const [timestamps, setTimestamps] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    if (!stages) return;

    const txsWithoutTimestamp: Array<{ hash: string; blockNumber: number }> =
      [];

    for (const stage of stages) {
      for (const tx of stage.transactions) {
        if (!tx.timestamp && tx.blockNumber && !timestamps.has(tx.hash)) {
          txsWithoutTimestamp.push({
            hash: tx.hash,
            blockNumber: tx.blockNumber,
          });
        }
      }
    }

    if (txsWithoutTimestamp.length === 0) return;

    const fetchTimestamps = async () => {
      try {
        const provider = getOrCreateProvider(l2RpcUrl);
        const newTimestamps = new Map(timestamps);

        const uniqueBlocks = [
          ...new Set(txsWithoutTimestamp.map((t) => t.blockNumber)),
        ];
        const blocks = await Promise.all(
          uniqueBlocks.map((bn) => provider.getBlock(bn).catch(() => null))
        );

        const blockTimestamps = new Map<number, number>();
        for (const block of blocks) {
          if (block) {
            blockTimestamps.set(block.number, block.timestamp);
          }
        }

        for (const tx of txsWithoutTimestamp) {
          const timestamp = blockTimestamps.get(tx.blockNumber);
          if (timestamp) {
            newTimestamps.set(tx.hash, timestamp);
          }
        }

        setTimestamps(newTimestamps);
      } catch (err) {
        // Silent fail - timestamps are optional enhancement
      }
    };

    fetchTimestamps();
  }, [stages, l2RpcUrl, timestamps]);

  return timestamps;
}

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

interface PhaseEta {
  startTimestamp: number;
  endTimestamp: number;
}

function calculatePhaseEtas(
  nextElectionTimestamp: number
): Record<ElectionPhase, PhaseEta | null> {
  const contenderStart = nextElectionTimestamp;
  const contenderEnd =
    contenderStart + ELECTION_TIMING.CONTENDER_SUBMISSION_DAYS * 86400;
  const nomineeEnd =
    contenderEnd + ELECTION_TIMING.NOMINEE_SELECTION_DAYS * 86400;
  const vettingEnd = nomineeEnd + ELECTION_TIMING.VETTING_PERIOD_DAYS * 86400;
  const memberEnd = vettingEnd + ELECTION_TIMING.MEMBER_ELECTION_DAYS * 86400;

  return {
    NOT_STARTED: null,
    CONTENDER_SUBMISSION: {
      startTimestamp: contenderStart,
      endTimestamp: contenderEnd,
    },
    NOMINEE_SELECTION: {
      startTimestamp: contenderEnd,
      endTimestamp: nomineeEnd,
    },
    VETTING_PERIOD: { startTimestamp: nomineeEnd, endTimestamp: vettingEnd },
    MEMBER_ELECTION: { startTimestamp: vettingEnd, endTimestamp: memberEnd },
    PENDING_EXECUTION: { startTimestamp: memberEnd, endTimestamp: 0 },
    COMPLETED: null,
  };
}

function formatEtaDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getTimeUntil(timestamp: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = timestamp - now;
  if (diff <= 0) return "now";
  return formatDuration(diff);
}

function getElectionStartFromStages(stages?: TrackedStage[]): number | null {
  if (!stages) return null;
  const createStage = stages.find((s) => s.type === "CREATE_ELECTION");
  const tx = createStage?.transactions?.[0];
  return tx?.timestamp ?? null;
}

export function ElectionPhaseTimeline({
  currentPhase,
  stages,
  status,
  electionIndex,
  className,
}: ElectionPhaseTimelineProps): React.ReactElement {
  const { openTimelock } = useDeepLink();
  const { l2Rpc } = useRpcSettings();
  const { nomineeGovernorAddress, chainId } = useElectionContracts();
  const currentIndex = getPhaseIndex(currentPhase);
  const timelockTxHash = getL2TimelockTxHash(stages);

  const fetchedTimestamps = useFetchMissingTimestamps(stages, l2Rpc);

  // Read the on-chain scheduled start timestamp for this election
  const { data: onChainTimestamp } = useReadContract({
    address: nomineeGovernorAddress,
    abi: nomineeElectionGovernorReadAbi,
    functionName: "electionToTimestamp",
    args: electionIndex !== undefined ? [BigInt(electionIndex)] : undefined,
    chainId,
    query: {
      enabled: electionIndex !== undefined,
      staleTime: Infinity,
    },
  });

  const resolvedStartTimestamp =
    getElectionStartFromStages(stages) ??
    (onChainTimestamp !== undefined ? Number(onChainTimestamp) : null);

  const phaseEtas =
    status?.nextElectionTimestamp && currentPhase === "NOT_STARTED"
      ? calculatePhaseEtas(status.nextElectionTimestamp)
      : resolvedStartTimestamp
        ? calculatePhaseEtas(resolvedStartTimestamp)
        : null;

  return (
    <div className={cn("space-y-4", className)}>
      <h3 className="text-lg font-semibold">Election Timeline</h3>

      {currentPhase === "NOT_STARTED" && status?.nextElectionTimestamp && (
        <div className="flex items-center gap-2 rounded-lg border border-blue-500/30 bg-blue-500/10 p-3 text-blue-500">
          <Calendar className="h-5 w-5 shrink-0" />
          <div className="flex-1">
            <span className="font-medium">Next Election</span>
            <p className="text-sm text-blue-400">
              Starts {formatEtaDate(status.nextElectionTimestamp)} (
              {getTimeUntil(status.nextElectionTimestamp)})
            </p>
          </div>
        </div>
      )}

      <div className="relative">
        {TIMELINE_PHASES.map((phase, index) => {
          const metadata = PHASE_METADATA[phase];
          const isCompleted = index < currentIndex;
          const isActive = index === currentIndex;
          const isFuture = index > currentIndex;
          const eta = phaseEtas?.[phase];

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
                {eta && isActive && eta.endTimestamp > 0 && (
                  <p className="mt-1 text-xs font-medium text-primary">
                    Ends in {getTimeUntil(eta.endTimestamp)}
                  </p>
                )}
                {eta && isFuture && (
                  <p className="mt-1 text-xs text-muted-foreground/70">
                    Starts in {getTimeUntil(eta.startTimestamp)} (
                    {formatEtaDate(eta.startTimestamp)})
                  </p>
                )}
                <PhaseTransactionLinks
                  phase={phase}
                  stages={stages}
                  fetchedTimestamps={fetchedTimestamps}
                />
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

function formatTxDate(timestamp?: number): string | null {
  if (!timestamp) return null;
  return new Date(timestamp * 1000).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function PhaseTransactionLinks({
  phase,
  stages,
  fetchedTimestamps,
}: {
  phase: ElectionPhase;
  stages?: TrackedStage[];
  fetchedTimestamps?: Map<string, number>;
}): React.ReactElement | null {
  const transactions = getTransactionsForPhase(phase, stages);
  if (transactions.length === 0) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {transactions.map((tx) => {
        const timestamp = tx.timestamp ?? fetchedTimestamps?.get(tx.hash);

        return (
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
            {timestamp && (
              <span className="text-muted-foreground/70">
                {formatTxDate(timestamp)}
              </span>
            )}
            <ExternalLink className="h-3 w-3" />
          </a>
        );
      })}
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
