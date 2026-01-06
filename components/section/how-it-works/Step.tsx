import { type FeatureProps } from "@/types/feature";
import clsx from "clsx";

interface ExtendedFeatureProps extends FeatureProps {
  stepNumber?: number;
}

export default function Step({
  step,
  isActive,
  className,
  stepNumber,
  ...props
}: ExtendedFeatureProps) {
  return (
    <div
      className={clsx(
        "floating-card glow-border p-6 transition-all duration-300",
        isActive
          ? "ring-2 ring-violet-500/50 dark:ring-violet-400/30"
          : "opacity-80 hover:opacity-100",
        className
      )}
      {...props}
    >
      {/* Step number badge */}
      {stepNumber && (
        <div className="absolute -top-3 -left-3 flex h-8 w-8 items-center justify-center rounded-full bg-violet-600 text-sm font-bold text-white shadow-lg dark:bg-violet-500">
          {stepNumber}
        </div>
      )}

      {/* Icon container */}
      <div
        className={clsx(
          "flex h-12 w-12 items-center justify-center rounded-xl transition-colors duration-300",
          isActive
            ? "bg-gradient-to-br from-violet-500 to-violet-700 shadow-lg shadow-violet-500/25"
            : "bg-slate-200 dark:bg-slate-700"
        )}
      >
        <svg aria-hidden="true" className="h-7 w-7" fill="none">
          <step.icon />
        </svg>
      </div>

      {/* Title */}
      <h3
        className={clsx(
          "mt-5 text-sm font-semibold uppercase tracking-wider",
          isActive
            ? "text-violet-600 dark:text-violet-400"
            : "text-slate-500 dark:text-slate-400"
        )}
      >
        {step.name}
      </h3>

      {/* Summary */}
      <p className="mt-3 text-lg font-semibold leading-snug text-slate-900 dark:text-slate-100">
        {step.summary}
      </p>

      {/* Description */}
      <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
        {step.description}
      </p>
    </div>
  );
}
