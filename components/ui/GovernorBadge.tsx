"use client";

import { memo } from "react";

import { getGovernorTypeFromName, type GovernorType } from "@/config/governors";
import { cn } from "@/lib/utils";

interface GovernorBadgeProps {
  governorName: string;
  /** Size variant: "sm" for mobile cards, "default" for table cells */
  size?: "sm" | "default";
  className?: string;
}

const GOVERNOR_BADGES: Record<GovernorType, { label: string; color: string }> =
  {
    // Core = brand blue
    core: {
      label: "Core",
      color:
        "bg-arb-brand/15 text-arb-brand ring-arb-brand/30 hover:bg-arb-brand/25",
    },
    // Treasury = accent teal-green
    treasury: {
      label: "Treasury",
      color:
        "bg-arb-accent2/15 text-arb-accent2 ring-arb-accent2/30 hover:bg-arb-accent2/25",
    },
    // L1 voting = violet, apart from both Arbitrum One governors
    l1: {
      label: "L1 Voting",
      color:
        "bg-violet-500/15 text-violet-600 ring-violet-500/30 hover:bg-violet-500/25 dark:text-violet-300",
    },
  };

/**
 * Displays a styled badge indicating which governor a proposal is from: Core,
 * Treasury, or the L1 voting governor.
 * Uses glassmorphism design with governor-specific accent colors
 */
export const GovernorBadge = memo(function GovernorBadge({
  governorName,
  size = "default",
  className,
}: GovernorBadgeProps) {
  const badge = GOVERNOR_BADGES[getGovernorTypeFromName(governorName)];

  const sizeClasses =
    size === "sm"
      ? "text-[9px] px-2 py-0.5 tracking-wide"
      : "text-[10px] px-2.5 py-1 tracking-wider";

  return (
    <span
      className={cn(
        // Base styles: uppercase tag pill (Figma "Routes Tag")
        "inline-flex items-center rounded-md font-semibold uppercase",
        "backdrop-blur-md ring-1 ring-inset transition-all duration-200",
        sizeClasses,
        badge.color,
        className
      )}
    >
      {badge.label}
    </span>
  );
});
