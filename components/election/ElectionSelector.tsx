"use client";

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
import { formatCohort, PHASE_METADATA } from "@/config/security-council";
import type { ElectionPhase } from "@/types/election";
import type { ElectionProposalStatus } from "@gzeoneth/gov-tracker";

interface ElectionSelectorProps {
  allElections: ElectionProposalStatus[];
  selectedElection: ElectionProposalStatus | null;
  onSelect: (index: number | null) => void;
}

export function ElectionSelector({
  allElections,
  selectedElection,
  onSelect,
}: ElectionSelectorProps): React.ReactElement | null {
  if (allElections.length <= 1) {
    return null;
  }

  const activeElections = allElections.filter((e) => e.phase !== "COMPLETED");
  const completedElections = allElections.filter(
    (e) => e.phase === "COMPLETED"
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="gap-2">
          <History className="h-4 w-4" />
          {selectedElection
            ? `Election #${selectedElection.electionIndex}`
            : "Select Election"}
          <ChevronDown className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        {activeElections.length > 0 && (
          <>
            <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
              Active Elections
            </div>
            {activeElections.map((election) => (
              <ElectionMenuItem
                key={election.electionIndex}
                election={election}
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
  isSelected,
  onSelect,
}: {
  election: ElectionProposalStatus;
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
          Election #{election.electionIndex}
        </span>
        <span className="text-xs text-muted-foreground">
          {formatCohort(election.cohort)}
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
