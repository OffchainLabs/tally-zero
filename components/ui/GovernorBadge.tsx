"use client";

import { memo } from "react";

import { getGovernorTypeFromName } from "@/config/governors";
import { cn } from "@/lib/utils";

interface GovernorBadgeProps {
  governorName: string;
  /** Size variant: "sm" for mobile cards, "default" for table cells */
  size?: "sm" | "default";
  className?: string;
}

/**
 * Displays a styled badge indicating whether a proposal is from Core or Treasury governor
 * Uses glassmorphism design with governor-specific accent colors
 */
export const GovernorBadge = memo(function GovernorBadge({
  governorName,
  size = "default",
  className,
}: GovernorBadgeProps) {
  const governorType = getGovernorTypeFromName(governorName);
  const isCore = governorType === "core";

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
        // Governor-specific colors: Core = brand blue, Treasury = accent teal-green
        isCore
          ? "bg-arb-brand/15 text-arb-brand ring-arb-brand/30 hover:bg-arb-brand/25"
          : "bg-arb-accent2/15 text-arb-accent2 ring-arb-accent2/30 hover:bg-arb-accent2/25",
        className
      )}
    >
      {isCore ? "Core" : "Treasury"}
    </span>
  );
});
