export type ElectionPhase =
  | "NOT_STARTED"
  | "CONTENDER_SUBMISSION"
  | "NOMINEE_SELECTION"
  | "VETTING_PERIOD"
  | "MEMBER_ELECTION"
  | "PENDING_EXECUTION"
  | "COMPLETED";

export type NomineeSortOrder = "random" | "alphabetical" | "votes";

export interface PhaseMetadata {
  name: string;
  description: string;
  durationDays: number;
  colorClass: string;
}
