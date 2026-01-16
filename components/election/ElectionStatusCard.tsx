"use client";

import { CheckCircle2, Clock, RefreshCw, Users } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
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
  onRefresh: () => void;
}

export function ElectionStatusCard({
  status,
  activeElection,
  isLoading,
  onRefresh,
}: ElectionStatusCardProps): React.ReactElement {
  if (isLoading && !status) {
    return <ElectionStatusSkeleton />;
  }

  if (!status) {
    return (
      <Card variant="glass">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Security Council Elections
          </CardTitle>
          <CardDescription>Unable to load election status</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const phase = activeElection?.phase ?? "NOT_STARTED";
  const phaseInfo = PHASE_METADATA[phase];

  return (
    <Card variant="glass">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Security Council Elections
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={onRefresh}
            disabled={isLoading}
          >
            <RefreshCw
              className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
            />
          </Button>
        </div>
        <CardDescription>
          Arbitrum DAO elects 6 council members every 6 months
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <div className="text-sm text-muted-foreground">Total Elections</div>
            <div className="text-2xl font-bold">{status.electionCount}</div>
          </div>

          <div className="space-y-2">
            <div className="text-sm text-muted-foreground">Current Cohort</div>
            <div className="text-2xl font-bold">
              {formatCohort(status.cohort)}
            </div>
          </div>
        </div>

        {activeElection ? (
          <ActiveElectionStatus
            election={activeElection}
            phaseInfo={phaseInfo}
            phase={phase}
          />
        ) : (
          <NextElectionStatus status={status} />
        )}
      </CardContent>
    </Card>
  );
}

function ActiveElectionStatus({
  election,
  phaseInfo,
  phase,
}: {
  election: ElectionProposalStatus;
  phaseInfo: { name: string; description: string };
  phase: ElectionPhase;
}): React.ReactElement {
  return (
    <div className="space-y-3 rounded-lg border border-border/50 bg-muted/30 p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">
          Election #{election.electionIndex}
        </span>
        <Badge variant="secondary" className={getPhaseColor(phase)}>
          {phaseInfo.name}
        </Badge>
      </div>

      <p className="text-sm text-muted-foreground">{phaseInfo.description}</p>

      <div className="grid gap-2 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Compliant Nominees</span>
          <span className="font-medium">
            {election.compliantNomineeCount} / {election.targetNomineeCount}
          </span>
        </div>

        {election.isInVettingPeriod && election.vettingDeadline && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Vetting Deadline</span>
            <span className="font-medium">
              Block #{election.vettingDeadline.toLocaleString()}
            </span>
          </div>
        )}

        {election.canProceedToMemberPhase && (
          <div className="flex items-center gap-2 text-green-500">
            <CheckCircle2 className="h-4 w-4" />
            <span>Ready for Member Election</span>
          </div>
        )}

        {election.canExecuteMember && (
          <div className="flex items-center gap-2 text-purple-500">
            <CheckCircle2 className="h-4 w-4" />
            <span>Ready to Execute</span>
          </div>
        )}
      </div>
    </div>
  );
}

function NextElectionStatus({
  status,
}: {
  status: ElectionStatus;
}): React.ReactElement {
  if (status.canCreateElection) {
    return (
      <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-4">
        <div className="flex items-center gap-2 text-green-500">
          <CheckCircle2 className="h-5 w-5" />
          <span className="font-medium">Ready to Create Election</span>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          A new Security Council election can be created now.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border/50 bg-muted/30 p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Clock className="h-5 w-5" />
        <span className="font-medium">Next Election</span>
      </div>
      <div className="mt-2 text-2xl font-bold">
        {formatDuration(status.secondsUntilElection)}
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {status.timeUntilElection}
      </p>
    </div>
  );
}

function ElectionStatusSkeleton(): React.ReactElement {
  return (
    <Card variant="glass">
      <CardHeader>
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-64 mt-2" />
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-12" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-32" />
          </div>
        </div>
        <Skeleton className="h-24 w-full" />
      </CardContent>
    </Card>
  );
}
