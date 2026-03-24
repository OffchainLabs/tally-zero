export type ElectionPhase =
  | "NOT_STARTED"
  | "CONTENDER_SUBMISSION"
  | "VETTING_PERIOD"
  | "NOMINEE_SELECTION"
  | "MEMBER_ELECTION"
  | "PENDING_EXECUTION"
  | "COMPLETED";

export interface PhaseMetadata {
  name: string;
  description: string;
  durationDays: number;
  colorClass: string;
}
