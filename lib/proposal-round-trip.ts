/**
 * Whether an Arbitrum Core proposal's L1 round-trip has actually finished.
 *
 * An OpenZeppelin governor's `state()` only covers the L2 half. `execute()` runs
 * the L2 timelock, and what that executes is an `ArbSys.sendTxToL1` withdrawal —
 * so `Executed` means "the L2 half finished and a message is in flight", roughly
 * ten days before the change is live. The L2→L1 challenge window, the 3-day L1
 * timelock and the retryable redemption all still lie ahead.
 */

import { getGovernorByAddress } from "@/config/governors";
import type { ProposalStage, StageType } from "@/types/proposal-stage";
import {
  findStage,
  getLifecyclePhase,
  type LifecyclePhase,
} from "@gzeoneth/gov-tracker";

/** Stages that only exist after L2 execution, i.e. the round-trip itself. */
const TIMELOCK_PATH_STAGE_TYPES: readonly StageType[] = [
  "L2_TIMELOCK",
  "L2_TO_L1_MESSAGE",
  "L1_TIMELOCK",
  "RETRYABLE_EXECUTED",
];

/** Stage statuses that mean a stage will not run again. */
const SETTLED: ReadonlySet<string> = new Set(["COMPLETED", "SKIPPED"]);

export interface RoundTripEvidence {
  status: "pending" | "complete";
  /** Which hop is outstanding; for detail text only, never used to decide `status`. */
  phase: LifecyclePhase;
}

/**
 * Decide the round-trip from a stage list, or null when the stages carry no
 * evidence either way.
 *
 * Deliberately does not use `areAllStagesComplete` or `getLifecyclePhase` to
 * decide. A checkpoint persists only the stages tracking reached, so one saved
 * on a stage boundary has every stage `COMPLETED` and both of those report a
 * mid-flight proposal as finished. Requiring the governor's own `finalStage` to
 * be present and settled cannot be fooled that way — for a Core proposal that is
 * `RETRYABLE_EXECUTED`, the hop that actually applies the change.
 */
export function roundTripFromStages(
  stages: ProposalStage[],
  governorAddress: string
): RoundTripEvidence | null {
  const governor = getGovernorByAddress(governorAddress);
  if (!governor || stages.length === 0) return null;

  const final = findStage(stages, governor.finalStage);
  if (final && SETTLED.has(final.status)) {
    return { status: "complete", phase: "executed" };
  }

  // Only claim "pending" on positive evidence that the round-trip began.
  if (!stages.some((s) => TIMELOCK_PATH_STAGE_TYPES.includes(s.type))) {
    return null;
  }

  // Computed from the same partial array, so it can disagree with the check
  // above; when it does, the finalStage check wins.
  const phase = getLifecyclePhase(stages);
  return { status: "pending", phase: phase === "executed" ? "unknown" : phase };
}

/** Human-readable detail for the hop a proposal is waiting on. */
export function describeRoundTripPhase(
  evidence: RoundTripEvidence | null
): string | null {
  if (evidence?.status !== "pending") return null;
  switch (evidence.phase) {
    case "bridging":
      return "Waiting out the L2→L1 challenge period";
    case "l1_delay":
      return "Waiting out the L1 timelock delay";
    case "finalizing":
      return "Waiting for the retryable ticket to be redeemed";
    default:
      return "L1 round-trip in progress";
  }
}
