import {
  ADDRESSES,
  ELECTION_TIMING,
  type StageType,
} from "@gzeoneth/gov-tracker";

import {
  MS_PER_SECOND,
  SECONDS_PER_DAY,
  SECONDS_PER_HOUR,
  SECONDS_PER_MINUTE,
} from "@/lib/date-utils";
import type { ElectionPhase, PhaseMetadata } from "@/types/election";

export const SC_CONTRACTS = {
  NOMINEE_ELECTION_GOVERNOR: ADDRESSES.ELECTION_NOMINEE_GOVERNOR,
  MEMBER_ELECTION_GOVERNOR: ADDRESSES.ELECTION_MEMBER_GOVERNOR,
  SECURITY_COUNCIL_MANAGER: ADDRESSES.SECURITY_COUNCIL_MANAGER,
} as const;

export const ELECTION_DURATIONS = {
  CONTENDER_SUBMISSION: ELECTION_TIMING.CONTENDER_SUBMISSION_DAYS,
  NOMINEE_SELECTION: ELECTION_TIMING.NOMINEE_SELECTION_DAYS,
  VETTING_PERIOD: ELECTION_TIMING.VETTING_PERIOD_DAYS,
  MEMBER_ELECTION: ELECTION_TIMING.MEMBER_ELECTION_DAYS,
  TOTAL: ELECTION_TIMING.TOTAL_ELECTION_DAYS,
} as const;

export const PHASE_METADATA: Record<ElectionPhase, PhaseMetadata> = {
  NOT_STARTED: {
    name: "Not Started",
    description: "Election has not yet begun",
    durationDays: 0,
    colorClass: "text-muted-foreground",
  },
  CONTENDER_SUBMISSION: {
    name: "Contender Submission",
    description:
      "DAO members declare candidacy. Anyone can register as a contender.",
    durationDays: ELECTION_DURATIONS.CONTENDER_SUBMISSION,
    colorClass: "text-cyan-500",
  },
  NOMINEE_SELECTION: {
    name: "Nominee Selection",
    description:
      "Delegates must endorse contenders with 0.2% of votable tokens for contenders to be nominated for the Member Election",
    durationDays: ELECTION_DURATIONS.NOMINEE_SELECTION,
    colorClass: "text-blue-500",
  },
  VETTING_PERIOD: {
    name: "Compliance Check",
    description:
      "The Arbitrum Foundation vets nominees for compliance before the member election.",
    durationDays: ELECTION_DURATIONS.VETTING_PERIOD,
    colorClass: "text-yellow-500",
  },
  MEMBER_ELECTION: {
    name: "Member Election",
    description:
      "Token holders vote for their preferred nominees. Top 6 are elected.",
    durationDays: ELECTION_DURATIONS.MEMBER_ELECTION,
    colorClass: "text-green-500",
  },
  PENDING_EXECUTION: {
    name: "Pending Execution",
    description:
      "Election succeeded. Waiting for execution to install new council members.",
    durationDays: 0,
    colorClass: "text-arb-blue",
  },
  COMPLETED: {
    name: "Completed",
    description:
      "Election has been executed and new council members installed.",
    durationDays: 0,
    colorClass: "text-emerald-500",
  },
} as const;

export const TARGET_COHORT_SIZE = 6;

export const TOTAL_SC_MEMBERS = 12;

export const PHASE_TO_STAGE_TYPES: Record<ElectionPhase, StageType[]> = {
  NOT_STARTED: [],
  CONTENDER_SUBMISSION: ["CREATE_ELECTION"],
  NOMINEE_SELECTION: ["NOMINEE_ELECTION"],
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

export const NOMINEE_QUORUM_PERCENT = 0.2;

export function getPhaseColor(phase: ElectionPhase): string {
  return PHASE_METADATA[phase].colorClass;
}

export function getPhaseBadgeVariant(
  phase: ElectionPhase
): "default" | "secondary" | "destructive" | "outline" {
  if (phase === "COMPLETED") return "default";
  if (phase === "NOT_STARTED") return "outline";
  return "secondary";
}

export function formatCohort(cohort: 0 | 1): string {
  return cohort === 0 ? "First Cohort" : "Second Cohort";
}

export function daysUntil(timestamp: number): number {
  const now = Math.floor(Date.now() / MS_PER_SECOND);
  const diff = timestamp - now;
  return Math.max(0, Math.ceil(diff / SECONDS_PER_DAY));
}

export function formatDuration(seconds: number): string {
  if (seconds <= 0) return "Now";

  const days = Math.floor(seconds / SECONDS_PER_DAY);
  const hours = Math.floor((seconds % SECONDS_PER_DAY) / SECONDS_PER_HOUR);
  const minutes = Math.floor((seconds % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);

  if (days > 0) {
    return `${days}d ${hours}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}
