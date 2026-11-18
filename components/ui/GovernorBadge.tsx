"use client";

import { memo } from "react";

import { getGovernorTypeFromName, type GovernorType } from "@/config/governors";
import { cn } from "@/lib/utils";

// Keyed by GovernorType so a new governor kind fails the build here instead of
// falling through to another governor's label.
const BADGE_VARIANTS: Record<GovernorType, { label: string; classes: string }> =
  {
    core: {
      label: "Core",
      classes:
        "bg-arb-brand/15 text-arb-brand ring-arb-brand/30 hover:bg-arb-brand/25",
    },
    treasury: {
      label: "Treasury",
      classes:
        "bg-arb-accent2/15 text-arb-accent2 ring-arb-accent2/30 hover:bg-arb-accent2/25",
    },
    l1: {
      label: "L1",
      classes:
        "bg-arb-yellow/15 text-arb-yellow ring-arb-yellow/30 hover:bg-arb-yellow/25",
    },
  };

interface GovernorBadgeProps {
  governorName: string;
  /** Size variant: "sm" for mobile cards, "default" for table cells */
  size?: "sm" | "default";
  className?: string;
}

/**
 * Displays a styled badge indicating which governor a proposal is from (Core, Treasury or L1 voting)
 * Uses glassmorphism design with governor-specific accent colors
 */
export const GovernorBadge = memo(function GovernorBadge({
  governorName,
  size = "default",
  className,
}: GovernorBadgeProps) {
  const variant = BADGE_VARIANTS[getGovernorTypeFromName(governorName)];

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
        // Governor-specific colors: Core = brand blue, Treasury = accent teal-green, L1 = yellow
        variant.classes,
        className
      )}
    >
      {variant.label}
    </span>
  );
});
