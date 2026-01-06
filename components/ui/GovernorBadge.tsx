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
    size === "sm" ? "text-[10px] px-2 py-0.5" : "text-xs px-2.5 py-0.5";

  return (
    <span
      className={cn(
        // Base styles
        "inline-flex items-center rounded-md font-medium",
        "transition-all duration-200",
        sizeClasses,
        // Glass effect
        "backdrop-blur-md",
        // Governor-specific colors with glass transparency
        isCore
          ? [
              // Light mode: blue tint
              "bg-blue-500/10 text-blue-700 border border-blue-300/40",
              // Dark mode: blue tint
              "dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-400/30",
              // Hover effects
              "hover:bg-blue-500/20 hover:border-blue-300/60",
              "dark:hover:bg-blue-500/25 dark:hover:border-blue-400/50",
            ]
          : [
              // Light mode: amber tint
              "bg-amber-500/10 text-amber-700 border border-amber-300/40",
              // Dark mode: amber tint
              "dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-400/30",
              // Hover effects
              "hover:bg-amber-500/20 hover:border-amber-300/60",
              "dark:hover:bg-amber-500/25 dark:hover:border-amber-400/50",
            ],
        className
      )}
    >
      {isCore ? "Core" : "Treasury"}
    </span>
  );
});
