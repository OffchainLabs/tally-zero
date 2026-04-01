"use client";

import { CheckCircle2, Clock, RefreshCw } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  formatCohort,
  formatDuration,
  getPhaseColor,
  PHASE_METADATA,
} from "@/config/security-council";
import type { ElectionPhase } from "@/types/election";
import type {
  ElectionProposalStatus,
  ElectionStatus,
} from "@gzeoneth/gov-tracker";

interface ElectionStatusCardProps {
  status: ElectionStatus | null;
  activeElection: ElectionProposalStatus | null;
  isLoading: boolean;
  isRefreshing: boolean;
  onRefresh: () => void;
}

export function ElectionStatusCard({
  status,
  activeElection,
  isLoading,
  isRefreshing,
  onRefresh,
}: ElectionStatusCardProps): React.ReactElement {
  if (isLoading && (!status || !activeElection)) {
    return (
      <div className="flex items-center gap-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-8 w-8 rounded-md" />
      </div>
    );
  }

  if (!status) {
    return (
      <p className="text-sm text-muted-foreground">
        Unable to load election status
      </p>
    );
  }

  const phase: ElectionPhase = activeElection?.phase ?? "NOT_STARTED";
  const phaseInfo = PHASE_METADATA[phase];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <Badge variant="secondary" className={getPhaseColor(phase)}>
          {phaseInfo.name}
        </Badge>
        {activeElection && (
          <span className="text-sm text-muted-foreground">
            {formatCohort(activeElection.cohort)}
          </span>
        )}

        {activeElection?.isInVettingPeriod &&
          activeElection.vettingDeadline && (
            <span className="text-xs text-muted-foreground">
              Vetting deadline: L1 block #
              {activeElection.vettingDeadline.toLocaleString()}
            </span>
          )}

        <Button
          variant="ghost"
          size="sm"
          onClick={onRefresh}
          disabled={isRefreshing}
          className="ml-auto h-7 w-7 p-0"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`}
          />
        </Button>
      </div>

      {activeElection?.canProceedToMemberPhase &&
        phase !== "VETTING_PERIOD" && (
          <div className="flex items-center gap-2 text-green-500 text-sm">
            <CheckCircle2 className="h-4 w-4" />
            <span>Ready for Member Election</span>
          </div>
        )}

      {activeElection?.canExecuteMember && (
        <div className="flex items-center gap-2 text-arb-blue text-sm">
          <CheckCircle2 className="h-4 w-4" />
          <span>Ready to Execute</span>
        </div>
      )}

      {!activeElection && <NextElectionStatus status={status} />}
    </div>
  );
}

function NextElectionStatus({
  status,
}: {
  status: ElectionStatus;
}): React.ReactElement | null {
  if (status.canCreateElection) {
    return (
      <div className="flex items-center gap-2 text-green-500 text-sm">
        <CheckCircle2 className="h-4 w-4" />
        <span>A new Security Council election can be created now.</span>
      </div>
    );
  }

  if (!status.nextElectionTimestamp) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <Clock className="h-4 w-4" />
      <span>
        Next election in {formatDuration(status.secondsUntilElection)}
      </span>
    </div>
  );
}
