"use client";

import { AlertCircle } from "lucide-react";

import { useElectionStatus } from "@/hooks/use-election-status";
import { useRpcSettings } from "@/hooks/use-rpc-settings";
import type { ElectionPhase } from "@/types/election";
import { ElectionPhaseTimeline } from "./ElectionPhaseTimeline";
import { ElectionSelector } from "./ElectionSelector";
import { ElectionStatusCard } from "./ElectionStatusCard";
import { NomineeList } from "./NomineeList";

export function ElectionContainer(): React.ReactElement {
  const { l2Rpc, l1Rpc } = useRpcSettings();

  const {
    status,
    allElections,
    selectedElection,
    nomineeDetails,
    memberDetails,
    isLoading,
    error,
    refresh,
    selectElection,
  } = useElectionStatus({
    enabled: true,
    l2RpcUrl: l2Rpc || undefined,
    l1RpcUrl: l1Rpc || undefined,
    refreshInterval: 60000,
  });

  const currentPhase: ElectionPhase = selectedElection?.phase ?? "NOT_STARTED";

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
        <div className="flex items-center gap-2 text-destructive">
          <AlertCircle className="h-5 w-5" />
          <span className="font-medium">Failed to load election status</span>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <ElectionSelector
          allElections={allElections}
          selectedElection={selectedElection}
          onSelect={selectElection}
        />
      </div>

      <ElectionStatusCard
        status={status}
        activeElection={selectedElection}
        isLoading={isLoading}
        onRefresh={refresh}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <ElectionPhaseTimeline
          currentPhase={currentPhase}
          stages={selectedElection?.stages}
        />

        <NomineeList
          nomineeDetails={nomineeDetails}
          memberDetails={memberDetails}
          isLoading={isLoading}
          phase={currentPhase}
        />
      </div>
    </div>
  );
}
