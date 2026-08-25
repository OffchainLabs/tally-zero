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

/** DAO Constitution section covering the Security Council election process. */
export const DAO_CONSTITUTION_ELECTIONS_URL =
  "https://docs.arbitrum.foundation/dao-constitution#section-4-security-council-elections";

/**
 * How late into the compliance phase a candidate may still rotate the signer
 * key they registered with. The rotation must land at least this many days
 * before the phase ends so the Arbitrum Foundation can veto a rotation that
 * skipped the correct procedure.
 */
export const CANDIDATE_ROTATION_CUTOFF_DAYS = 3;

/**
 * Governance timelock a sitting member's self-service key rotation goes
 * through (L2 timelock, L2 to L1 message, L1 timelock) before the new signer
 * is registered in the Security Council multisigs.
 */
export const MEMBER_ROTATION_TIMELOCK_DAYS = 18;

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
      "Delegates endorse contenders so they can be nominated for the Member Election.",
    durationDays: ELECTION_DURATIONS.NOMINEE_SELECTION,
    colorClass: "text-blue-500",
  },
  VETTING_PERIOD: {
    name: "Compliance Check",
    description: `The Arbitrum Foundation vets nominees for compliance before the member election. Candidates can rotate their signer key until ${CANDIDATE_ROTATION_CUTOFF_DAYS} days before this phase ends.`,
    durationDays: ELECTION_DURATIONS.VETTING_PERIOD,
    colorClass: "text-yellow-500",
  },
  MEMBER_ELECTION: {
    name: "Member Election",
    description:
      "Delegates vote for their preferred nominees. Top 6 are elected.",
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

/**
 * Nominee qualification threshold as a percentage of votable ARB. Only a
 * fallback for when the governor's `quorumNumerator`/`quorumDenominator` reads
 * are unavailable: the on-chain fraction is authoritative. The DAO lowered it
 * from 0.2% to 0.1% in the "Security Council Election Process Improvements"
 * AIP, which takes effect when that upgrade reaches the governor.
 */
export const NOMINEE_QUORUM_PERCENT = 0.1;

const PERCENT_SCALE = 100;
const MAX_PERCENT_DECIMALS = 3;

/**
 * Formats the governor's quorum fraction as a percentage label, e.g. "0.1%".
 * Falls back to {@link NOMINEE_QUORUM_PERCENT} when either read is missing or
 * unusable, so the copy never renders a blank or a bogus threshold.
 */
export function formatQuorumPercent(
  numerator?: bigint | number,
  denominator?: bigint | number
): string {
  const fallback = `${NOMINEE_QUORUM_PERCENT}%`;
  if (numerator === undefined || denominator === undefined) return fallback;

  const numeratorValue = Number(numerator);
  const denominatorValue = Number(denominator);
  if (!Number.isFinite(numeratorValue) || !Number.isFinite(denominatorValue)) {
    return fallback;
  }
  if (denominatorValue <= 0 || numeratorValue <= 0) return fallback;

  const percent = (numeratorValue / denominatorValue) * PERCENT_SCALE;
  return `${parseFloat(percent.toFixed(MAX_PERCENT_DECIMALS))}%`;
}

/**
 * Phase description with the live qualification threshold folded in. The
 * threshold is a governance parameter that the DAO can change without a code
 * change, so it is never baked into {@link PHASE_METADATA}.
 */
export function getPhaseDescription(
  phase: ElectionPhase,
  options?: { quorumPercentLabel?: string }
): string {
  const base = PHASE_METADATA[phase].description;
  if (phase !== "NOMINEE_SELECTION") return base;

  const label = options?.quorumPercentLabel ?? `${NOMINEE_QUORUM_PERCENT}%`;
  return `${base} A contender qualifies once its pledged votes reach ${label} of votable ARB.`;
}

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
