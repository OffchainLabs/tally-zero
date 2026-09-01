"use client";

import { useEffect, useMemo, useState } from "react";

import { ChevronDown, History } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/DropdownMenu";
import {
  daysUntil,
  formatCohort,
  PHASE_METADATA,
} from "@/config/security-council";
import { useRpcSettings } from "@/hooks/use-rpc-settings";
import { getOrCreateProvider } from "@/lib/rpc-utils";
import type { ElectionPhase } from "@/types/election";
import type {
  ElectionProposalStatus,
  ElectionStatus,
  StageTransaction,
} from "@gzeoneth/gov-tracker";

function formatElectionDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleDateString(undefined, {
    month: "short",
    year: "numeric",
  });
}

/**
 * The transaction that created an election, which is the only honest record of
 * when it ran.
 *
 * Deliberately not the governor's `electionToTimestamp`: that is a formula over
 * the *current* cadence, not a log of past elections. Once the "Security
 * Council Election Process Improvements" AIP moved elections from every 6
 * months to every 12, the formula restated the whole history as March dates a
 * year apart, dating election #1 to Mar 2021 when it actually ran in Sep 2023.
 */
export function getElectionCreationTx(
  election: ElectionProposalStatus
): StageTransaction | null {
  const createStage = election.stages?.find(
    (s) => s.type === "CREATE_ELECTION"
  );
  return createStage?.transactions?.[0] ?? null;
}

/**
 * Start timestamp per election index. Creation transactions usually arrive with
 * a timestamp; when the tracker only recorded a block number we resolve it from
 * the chain, since a missing date is better than a wrong one but worse than the
 * real one.
 */
function useElectionStartTimestamps(
  allElections: ElectionProposalStatus[]
): Map<number, number> {
  const { l2Rpc } = useRpcSettings();
  const [resolved, setResolved] = useState<Map<number, number>>(new Map());

  const creationTxs = useMemo(() => {
    const map = new Map<number, StageTransaction>();
    for (const election of allElections) {
      const tx = getElectionCreationTx(election);
      if (tx) map.set(election.electionIndex, tx);
    }
    return map;
  }, [allElections]);

  const unresolvedBlocks = useMemo(() => {
    const blocks = new Set<number>();
    for (const [index, tx] of creationTxs) {
      if (tx.timestamp || resolved.has(index)) continue;
      if (tx.blockNumber) blocks.add(tx.blockNumber);
    }
    return [...blocks].sort((a, b) => a - b);
  }, [creationTxs, resolved]);

  const unresolvedKey = unresolvedBlocks.join(",");

  useEffect(() => {
    if (unresolvedBlocks.length === 0) return;
    let cancelled = false;

    const resolveBlocks = async () => {
      try {
        const provider = getOrCreateProvider(l2Rpc);
        const blocks = await Promise.all(
          unresolvedBlocks.map((blockNumber) =>
            provider.getBlock(blockNumber).catch(() => null)
          )
        );
        if (cancelled) return;

        const timestampByBlock = new Map<number, number>();
        for (const block of blocks) {
          if (block) timestampByBlock.set(block.number, block.timestamp);
        }
        if (timestampByBlock.size === 0) return;

        setResolved((previous) => {
          const next = new Map(previous);
          for (const [index, tx] of creationTxs) {
            if (tx.timestamp || next.has(index)) continue;
            const timestamp = timestampByBlock.get(tx.blockNumber);
            if (timestamp) next.set(index, timestamp);
          }
          return next;
        });
      } catch {
        // The cohort label carries the entry on its own; a date is a bonus.
      }
    };

    resolveBlocks();
    return () => {
      cancelled = true;
    };
    // unresolvedKey stands in for unresolvedBlocks so a re-rendered but
    // unchanged election list does not refetch the same blocks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unresolvedKey, l2Rpc, creationTxs]);

  return useMemo(() => {
    const map = new Map<number, number>();
    for (const [index, tx] of creationTxs) {
      const timestamp = tx.timestamp ?? resolved.get(index);
      if (timestamp && timestamp > 0) map.set(index, timestamp);
    }
    return map;
  }, [creationTxs, resolved]);
}

interface ElectionSelectorProps {
  allElections: ElectionProposalStatus[];
  selectedElection: ElectionProposalStatus | null;
  status: ElectionStatus | null;
  onSelect: (index: number | null) => void;
}

export function ElectionSelector({
  allElections,
  selectedElection,
  status,
  onSelect,
}: ElectionSelectorProps): React.ReactElement | null {
  const startTimestamps = useElectionStartTimestamps(allElections);

  const timestampMap = useMemo(() => {
    const map = new Map<number, string>();
    for (const [index, timestamp] of startTimestamps) {
      map.set(index, formatElectionDate(timestamp));
    }
    return map;
  }, [startTimestamps]);

  if (allElections.length === 0) {
    return null;
  }

  const activeElections = allElections.filter((e) => e.phase !== "COMPLETED");
  const completedElections = allElections.filter(
    (e) => e.phase === "COMPLETED"
  );
  const nextElectionIndex = allElections.length;
  const hasNoActiveElection = activeElections.length === 0;
  const notYetCreated = !allElections.some(
    (e) => e.electionIndex === nextElectionIndex
  );
  const showNextElection = Boolean(
    notYetCreated &&
    (hasNoActiveElection ||
      (status?.nextElectionTimestamp && status.secondsUntilElection >= 0))
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="gap-2">
          <History className="h-4 w-4" />
          {selectedElection
            ? `Election #${selectedElection.electionIndex + 1}`
            : "Select Election"}
          <ChevronDown className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        {showNextElection && (
          <>
            <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
              Upcoming
            </div>
            <DropdownMenuItem
              className="flex items-center justify-between gap-2"
              onSelect={() => onSelect(null)}
            >
              <div className="flex flex-col">
                <span>Election #{nextElectionIndex + 1}</span>
                {status?.nextElectionTimestamp ? (
                  <span className="text-xs text-muted-foreground">
                    Starts in {daysUntil(status.nextElectionTimestamp)}d
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    Upcoming
                  </span>
                )}
              </div>
              <Badge variant="outline" className="text-xs">
                Not Started
              </Badge>
            </DropdownMenuItem>
            {(activeElections.length > 0 || completedElections.length > 0) && (
              <DropdownMenuSeparator />
            )}
          </>
        )}

        {activeElections.length > 0 && (
          <>
            <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
              Active Elections
            </div>
            {activeElections.map((election) => (
              <ElectionMenuItem
                key={election.electionIndex}
                election={election}
                electionDate={timestampMap.get(election.electionIndex)}
                isSelected={
                  selectedElection?.electionIndex === election.electionIndex
                }
                onSelect={() => onSelect(election.electionIndex)}
              />
            ))}
          </>
        )}

        {activeElections.length > 0 && completedElections.length > 0 && (
          <DropdownMenuSeparator />
        )}

        {completedElections.length > 0 && (
          <>
            <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
              Previous Elections
            </div>
            {completedElections.map((election) => (
              <ElectionMenuItem
                key={election.electionIndex}
                election={election}
                electionDate={timestampMap.get(election.electionIndex)}
                isSelected={
                  selectedElection?.electionIndex === election.electionIndex
                }
                onSelect={() => onSelect(election.electionIndex)}
              />
            ))}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ElectionMenuItem({
  election,
  electionDate,
  isSelected,
  onSelect,
}: {
  election: ElectionProposalStatus;
  electionDate?: string;
  isSelected: boolean;
  onSelect: () => void;
}): React.ReactElement {
  const phaseMetadata = PHASE_METADATA[election.phase as ElectionPhase];

  return (
    <DropdownMenuItem
      className="flex items-center justify-between gap-2"
      onSelect={onSelect}
    >
      <div className="flex flex-col">
        <span className={isSelected ? "font-medium" : ""}>
          Election #{election.electionIndex + 1}
        </span>
        <span className="text-xs text-muted-foreground">
          {formatCohort(election.cohort)}
          {electionDate && ` · ${electionDate}`}
        </span>
      </div>
      <Badge
        variant={election.phase === "COMPLETED" ? "default" : "secondary"}
        className="text-xs"
      >
        {phaseMetadata.name}
      </Badge>
    </DropdownMenuItem>
  );
}
