import { cn } from "@/lib/utils";

import { ModeToggle } from "@/components/ModeToggle";

export function SiteFooter({ className }: React.HTMLAttributes<HTMLElement>) {
  return (
    <footer
      className={cn(
        "relative glass-subtle rounded-t-xl",
        "border-t border-border/50",
        className
      )}
    >
      {/* Top accent line with gradient glow */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />

      <div className="container flex flex-col items-center justify-between gap-4 py-6 md:h-16 md:flex-row md:py-0">
        <ModeToggle />
      </div>
    </footer>
  );
}
