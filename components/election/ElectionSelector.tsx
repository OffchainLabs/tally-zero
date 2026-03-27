"use client";

import { useMemo } from "react";

import { nomineeElectionGovernorReadAbi } from "@gzeoneth/gov-tracker";
import { ChevronDown, History } from "lucide-react";
import { useReadContracts } from "wagmi";

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
import { useElectionContracts } from "@/hooks/use-election-contracts";
import type { ElectionPhase } from "@/types/election";
import type {
  ElectionProposalStatus,
  ElectionStatus,
} from "@gzeoneth/gov-tracker";

function formatElectionDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleDateString(undefined, {
    month: "short",
    year: "numeric",
  });
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
  const { nomineeGovernorAddress, chainId } = useElectionContracts();

  const timestampContracts = useMemo(
    () =>
      allElections.map((e) => ({
        address: nomineeGovernorAddress,
        abi: nomineeElectionGovernorReadAbi,
        functionName: "electionToTimestamp" as const,
        args: [BigInt(e.electionIndex)],
        chainId,
      })),
    [allElections, nomineeGovernorAddress, chainId]
  );

  const { data: timestampResults } = useReadContracts({
    contracts: timestampContracts,
    query: {
      enabled: allElections.length > 0,
      staleTime: Infinity,
    },
  });

  const timestampMap = useMemo(() => {
    const map = new Map<number, string>();
    if (!timestampResults) return map;
    for (let i = 0; i < allElections.length; i++) {
      const result = timestampResults[i];
      if (result?.status === "success" && result.result) {
        const ts = Number(result.result);
        if (ts > 0) {
          map.set(allElections[i].electionIndex, formatElectionDate(ts));
        }
      }
    }
    return map;
  }, [allElections, timestampResults]);

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
