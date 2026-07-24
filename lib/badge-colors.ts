/**
 * Centralized color definitions for badges, votes, and status indicators.
 * Use these constants to maintain consistency across the UI.
 */

// Vote type colors - aligned to the Figma "Proposals" palette
// (For = accent teal-green, Against = error red-orange, Abstain = muted grey).
export const VOTE_COLORS = {
  for: {
    text: "text-arb-accent2",
    bg: "bg-arb-accent2",
    dot: "bg-arb-accent2",
    gradient: "bg-arb-accent2",
  },
  against: {
    text: "text-arb-error",
    bg: "bg-arb-error",
    dot: "bg-arb-error",
    gradient: "bg-arb-error",
  },
  abstain: {
    text: "text-muted-foreground",
    bg: "bg-white/30",
    dot: "bg-white/30",
    gradient: "bg-white/25",
  },
} as const;

// Quorum status colors
export const QUORUM_COLORS = {
  reached: {
    text: "text-arb-accent2",
    bg: "bg-arb-accent2/20",
    ring: "ring-arb-accent2/30",
    icon: "text-arb-accent2",
    gradient: "bg-arb-accent2 shadow-[0_0_8px_rgba(60,200,160,0.5)]",
  },
  pending: {
    text: "text-arb-brand",
    bg: "bg-arb-brand/20",
    ring: "ring-arb-brand/30",
    icon: "text-arb-brand",
    gradient: "bg-arb-brand",
  },
} as const;

// Status badge colors (background + text for badges)
export const STATUS_BADGE_COLORS = {
  success:
    "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400",
  warning:
    "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  error: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  info: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400",
  muted: "bg-muted text-muted-foreground",
} as const;

export type VoteType = keyof typeof VOTE_COLORS;
export type StatusType = keyof typeof STATUS_BADGE_COLORS;
