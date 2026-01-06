import Link from "next/link";

import { siteConfig } from "@/config/site";
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
        <p className="text-center text-sm text-muted-foreground md:text-left">
          Powered by{" "}
          <Link
            href={siteConfig.url}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-foreground/80 underline-offset-4 transition-colors duration-200 hover:text-primary hover:underline"
          >
            Tally Zero
          </Link>
        </p>
        <ModeToggle />
      </div>
    </footer>
  );
}
