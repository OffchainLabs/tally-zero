"use client";

import * as ProgressPrimitive from "@radix-ui/react-progress";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/lib/utils";

const progressVariants = cva(
  "relative h-4 w-full overflow-hidden rounded-full",
  {
    variants: {
      variant: {
        default: "bg-secondary",
        glass: "glass-subtle shadow-inner",
      },
      indicatorVariant: {
        default: "",
        gradient: "",
        success: "",
        warning: "",
        danger: "",
      },
    },
    defaultVariants: {
      variant: "default",
      indicatorVariant: "default",
    },
  }
);

const indicatorStyles = {
  default: "bg-primary",
  gradient: "bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500",
  success: "bg-gradient-to-r from-emerald-400 to-green-500",
  warning: "bg-gradient-to-r from-amber-400 to-orange-500",
  danger: "bg-gradient-to-r from-red-400 to-rose-500",
};

interface ProgressProps
  extends React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root>,
    VariantProps<typeof progressVariants> {
  showShimmer?: boolean;
}

const Progress = React.forwardRef<
  React.ElementRef<typeof ProgressPrimitive.Root>,
  ProgressProps
>(
  (
    {
      className,
      value,
      variant,
      indicatorVariant,
      showShimmer = true,
      ...props
    },
    ref
  ) => (
    <ProgressPrimitive.Root
      ref={ref}
      className={cn(progressVariants({ variant, className }))}
      {...props}
    >
      <ProgressPrimitive.Indicator
        className={cn(
          "h-full w-full flex-1 transition-all duration-300 ease-out relative",
          indicatorStyles[indicatorVariant || "default"]
        )}
        style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
      >
        {/* Shimmer effect for glass variant */}
        {variant === "glass" && showShimmer && (
          <div className="absolute inset-0 overflow-hidden">
            <div
              className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/25 to-transparent"
              style={{
                animationTimingFunction: "ease-in-out",
              }}
            />
          </div>
        )}
      </ProgressPrimitive.Indicator>
    </ProgressPrimitive.Root>
  )
);
Progress.displayName = ProgressPrimitive.Root.displayName;

export { Progress, progressVariants };
