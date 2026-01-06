import { cn } from "@/lib/utils";

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-md",
        // Glass-like base with subtle transparency
        "bg-[var(--glass-bg-subtle)]",
        "backdrop-blur-sm",
        "border border-[var(--glass-border)]",
        // Shimmer overlay via pseudo-element
        "before:absolute before:inset-0",
        "before:bg-gradient-to-r",
        "before:from-transparent before:via-white/10 before:to-transparent",
        "dark:before:via-white/5",
        "before:animate-[shimmer_2s_ease-in-out_infinite]",
        className
      )}
      {...props}
    />
  );
}

export { Skeleton };
