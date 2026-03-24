"use client";

import { AlertCircle, FlaskConical } from "lucide-react";

import { DeepLinkHandler } from "@/components/container/DeepLinkHandler";
import { Badge } from "@/components/ui/Badge";
import { PHASE_METADATA } from "@/config/security-council";
import { STORAGE_KEYS } from "@/config/storage-keys";
import { useNerdMode } from "@/context/NerdModeContext";
import type {
  ElectionProposalStatus,
  SerializableMemberDetails,
  SerializableNomineeDetails,
} from "@gzeoneth/gov-tracker";

import type { ElectionContractOverrides } from "@/hooks/use-election-contracts";
import { useElectionStatus } from "@/hooks/use-election-status";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { useRpcSettings } from "@/hooks/use-rpc-settings";
import type { ElectionPhase } from "@/types/election";
import { ElectionActionCard } from "./ElectionActionCard";
import { ElectionPhaseTimeline } from "./ElectionPhaseTimeline";
import { ElectionSelector } from "./ElectionSelector";
import { ElectionStatusCard } from "./ElectionStatusCard";
import { NomineeList } from "./NomineeList";

type ActionablePhase =
  | "CONTENDER_SUBMISSION"
  | "NOMINEE_SELECTION"
  | "MEMBER_ELECTION";

const ACTIONABLE_PHASES: ActionablePhase[] = [
  "CONTENDER_SUBMISSION",
  "NOMINEE_SELECTION",
  "MEMBER_ELECTION",
];

function isActionablePhase(phase: string): phase is ActionablePhase {
  return (ACTIONABLE_PHASES as readonly string[]).includes(phase);
}

function getOverrideData({
  hasOverride,
  selectedElection,
  nomineeDetails,
  memberDetails,
  allElections,
  nomineeDetailsMap,
  memberDetailsMap,
}: {
  hasOverride: boolean;
  selectedElection: ElectionProposalStatus | null;
  nomineeDetails: SerializableNomineeDetails | null;
  memberDetails: SerializableMemberDetails | null;
  allElections: ElectionProposalStatus[];
  nomineeDetailsMap: Record<number, SerializableNomineeDetails | null>;
  memberDetailsMap: Record<number, SerializableMemberDetails | null>;
}): {
  overrideElection: ElectionProposalStatus | null;
  overrideNomineeDetails: SerializableNomineeDetails | null;
  overrideMemberDetails: SerializableMemberDetails | null;
} {
  if (!hasOverride) {
    return {
      overrideElection: selectedElection,
      overrideNomineeDetails: nomineeDetails,
      overrideMemberDetails: memberDetails,
    };
  }

  // If the selected election already has data, use it
  if (selectedElection && (nomineeDetails || memberDetails)) {
    return {
      overrideElection: selectedElection,
      overrideNomineeDetails: nomineeDetails,
      overrideMemberDetails: memberDetails,
    };
  }

  // Search backwards for the most recent election with data
  for (let i = allElections.length - 1; i >= 0; i--) {
    const election = allElections[i];
    const nd = nomineeDetailsMap[election.electionIndex];
    const md = memberDetailsMap[election.electionIndex];
    if (nd || md) {
      return {
        overrideElection: election,
        overrideNomineeDetails: nd ?? null,
        overrideMemberDetails: md ?? null,
      };
    }
  }

  return {
    overrideElection:
      selectedElection ?? allElections[allElections.length - 1] ?? null,
    overrideNomineeDetails: null,
    overrideMemberDetails: null,
  };
}

export function ElectionContainer(): React.ReactElement {
  const {
    l2Rpc,
    l1Rpc,
    l1ChunkSize,
    l2ChunkSize,
    isHydrated: rpcHydrated,
  } = useRpcSettings();
  const { nerdMode } = useNerdMode();
  const [contractOverrides, , overridesHydrated] =
    useLocalStorage<ElectionContractOverrides>(
      STORAGE_KEYS.ELECTION_CONTRACT_OVERRIDES,
      {}
    );
  const [phaseOverride] = useLocalStorage<string>(
    STORAGE_KEYS.ELECTION_PHASE_OVERRIDE,
    ""
  );

  const isHydrated = rpcHydrated && overridesHydrated;

  const {
    status,
    allElections,
    selectedElection,
    nomineeDetails,
    memberDetails,
    nomineeDetailsMap,
    memberDetailsMap,
    isLoading,
    error,
    refresh,
    selectElection,
  } = useElectionStatus({
    enabled: isHydrated,
    l2RpcUrl: l2Rpc || undefined,
    l1RpcUrl: l1Rpc || undefined,
    l1ChunkSize,
    l2ChunkSize,
    refreshInterval: 60000,
    nomineeGovernorAddress: contractOverrides?.nomineeGovernor || undefined,
    memberGovernorAddress: contractOverrides?.memberGovernor || undefined,
  });

  const realPhase: ElectionPhase = selectedElection?.phase ?? "NOT_STARTED";
  const hasOverride = nerdMode && isActionablePhase(phaseOverride);
  const currentPhase: ElectionPhase = hasOverride
    ? (phaseOverride as ElectionPhase)
    : realPhase;

  if (error) {
    return (
      <>
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
          <div className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-5 w-5" />
            <span className="font-medium">Failed to load election status</span>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        </div>
        <DeepLinkHandler proposals={[]} />
      </>
    );
  }

  const { overrideElection, overrideNomineeDetails, overrideMemberDetails } =
    getOverrideData({
      hasOverride,
      selectedElection,
      nomineeDetails,
      memberDetails,
      allElections,
      nomineeDetailsMap,
      memberDetailsMap,
    });

  return (
    <div className="space-y-6">
      {hasOverride && (
        <div className="flex items-center gap-2 rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3">
          <FlaskConical className="h-4 w-4 text-yellow-500 shrink-0" />
          <span className="text-sm text-yellow-500">
            Phase override active:{" "}
            <Badge variant="secondary" className="text-yellow-500 ml-1">
              {PHASE_METADATA[currentPhase].name}
            </Badge>
          </span>
          <span className="text-xs text-muted-foreground ml-auto">
            Disable in Settings → Governance Tools
          </span>
        </div>
      )}

      <div className="flex items-center justify-between gap-4">
        <ElectionSelector
          allElections={allElections}
          selectedElection={selectedElection}
          status={status}
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
          status={selectedElection ? status : null}
          electionIndex={selectedElection?.electionIndex}
        />

        <NomineeList
          nomineeDetails={nomineeDetails}
          memberDetails={memberDetails}
          isLoading={isLoading}
          phase={currentPhase}
          electionIndex={selectedElection?.electionIndex}
        />
      </div>

      <ElectionActionCard
        phase={currentPhase}
        selectedElection={overrideElection}
        nomineeDetails={overrideNomineeDetails}
        memberDetails={overrideMemberDetails}
        bypassSimulation={hasOverride}
      />

      <DeepLinkHandler proposals={[]} />
    </div>
  );
}
