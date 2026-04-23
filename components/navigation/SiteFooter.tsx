import Link from "next/link";

import { cn } from "@/lib/utils";

import { ModeToggle } from "@/components/ModeToggle";

export function SiteFooter({ className }: React.HTMLAttributes<HTMLElement>) {
  return (
    <footer
      className={cn(
        "relative glass-subtle backdrop-blur rounded-t-xl",
        "border-t border-border/50",
        className
      )}
    >
      {/* Top accent line with gradient glow */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />

      <div className="container flex flex-col items-center justify-between gap-4 py-6 md:h-16 md:flex-row md:py-0">
        <ModeToggle />
        <div className="flex items-center gap-4">
          <Link
            href="/tos"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Terms of Service
          </Link>
          <Link
            href="/privacy"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Privacy Policy
          </Link>
        </div>
      </div>
    </footer>
  );
}
