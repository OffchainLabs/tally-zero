/**
 * Types for Security Council actions sourced from the Arbitrum governance forum
 * (Discourse topics tagged `council-actions`).
 */

/**
 * Whether an action was taken under the Security Council's emergency powers.
 * `null` when the topic title does not say either way.
 */
export type CouncilActionKind = "emergency" | "non-emergency" | null;

/** A single Security Council action, one per forum topic. */
export interface CouncilAction {
  /** Discourse topic id. */
  id: number;
  /** Topic title as shown on the forum. */
  title: string;
  /** Permalink to the discourse post. */
  url: string;
  /** ISO 8601 timestamp of when the topic was created. */
  createdAt: string;
  kind: CouncilActionKind;
}
