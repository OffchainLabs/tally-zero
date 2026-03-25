import { memo } from "react";

import { cn } from "@/lib/utils";
import type { ProposalStateName } from "@/types/proposal";

/**
 * Glass-style status badge colors with glow effects
 * Maps proposal states to emerald, amber, green, rose, blue, arb-blue, gray, orange themes
 */
const STATE_GLASS_STYLES = {
  Active: {
    bg: "bg-emerald-500/20",
    text: "text-emerald-400",
    border: "border-emerald-500/30",
    shadow: "hover:shadow-emerald-500/40",
    dot: "bg-emerald-400",
  },
  Pending: {
    bg: "bg-amber-500/20",
    text: "text-amber-400",
    border: "border-amber-500/30",
    shadow: "hover:shadow-amber-500/40",
    dot: "bg-amber-400",
  },
  Succeeded: {
    bg: "bg-green-500/20",
    text: "text-green-400",
    border: "border-green-500/30",
    shadow: "hover:shadow-green-500/40",
    dot: "bg-green-400",
  },
  Defeated: {
    bg: "bg-rose-500/20",
    text: "text-rose-400",
    border: "border-rose-500/30",
    shadow: "hover:shadow-rose-500/40",
    dot: "bg-rose-400",
  },
  Executed: {
    bg: "bg-blue-500/20",
    text: "text-blue-400",
    border: "border-blue-500/30",
    shadow: "hover:shadow-blue-500/40",
    dot: "bg-blue-400",
  },
  Queued: {
    bg: "bg-arb-blue/20",
    text: "text-arb-teal",
    border: "border-arb-blue/30",
    shadow: "hover:shadow-arb-blue/40",
    dot: "bg-arb-teal",
  },
  Canceled: {
    bg: "bg-gray-500/20",
    text: "text-gray-400",
    border: "border-gray-500/30",
    shadow: "hover:shadow-gray-500/40",
    dot: "bg-gray-400",
  },
  Expired: {
    bg: "bg-orange-500/20",
    text: "text-orange-400",
    border: "border-orange-500/30",
    shadow: "hover:shadow-orange-500/40",
    dot: "bg-orange-400",
  },
} as const;

export interface StatusBadgeGlassProps extends React.HTMLAttributes<HTMLDivElement> {
  state: ProposalStateName;
}

// Default fallback styles for unknown states
const DEFAULT_STYLES = {
  bg: "bg-gray-500/20",
  text: "text-gray-400",
  border: "border-gray-500/30",
  shadow: "hover:shadow-gray-500/40",
  dot: "bg-gray-400",
};

const StatusBadgeGlass = memo(function StatusBadgeGlass({
  state,
  className,
  ...props
}: StatusBadgeGlassProps) {
  // Normalize state to capitalized form for lookup
  const normalizedState = (state.charAt(0).toUpperCase() +
    state.slice(1).toLowerCase()) as keyof typeof STATE_GLASS_STYLES;
  const styles = STATE_GLASS_STYLES[normalizedState] || DEFAULT_STYLES;
  const isActive = normalizedState === "Active";

  return (
    <div
      className={cn(
        // Base styles
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold",
        // Glassmorphism
        "backdrop-blur-sm border",
        // Transition for hover effects
        "transition-shadow duration-200",
        // Hover glow
        "hover:shadow-lg",
        // State-specific colors
        styles.bg,
        styles.text,
        styles.border,
        styles.shadow,
        className
      )}
      {...props}
    >
      {/* Dot indicator */}
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          styles.dot,
          isActive && "animate-pulse"
        )}
      />
      {normalizedState}
    </div>
  );
});

export { STATE_GLASS_STYLES, StatusBadgeGlass };
