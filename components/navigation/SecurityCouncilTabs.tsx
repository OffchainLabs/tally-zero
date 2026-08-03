"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@lib/utils";

interface SecurityCouncilTab {
  href: string;
  title: string;
}

const ACTIONS_PATH = "/security-council/actions";

const tabs: SecurityCouncilTab[] = [
  { href: "/security-council", title: "Elections" },
  { href: ACTIONS_PATH, title: "Security Council Actions" },
];

/**
 * Route-based tab bar for the Security Council section. Elections is the main
 * tab and stays selected on its sub-pages (contender profiles).
 */
export function SecurityCouncilTabs() {
  const pathname = usePathname();
  const onActions = pathname.startsWith(ACTIONS_PATH);

  return (
    <nav
      aria-label="Security Council section"
      className="inline-flex items-center gap-1 rounded-full glass-subtle backdrop-blur p-1 self-start overflow-x-auto max-w-full"
    >
      {tabs.map((tab) => {
        const active = tab.href === ACTIONS_PATH ? onActions : !onActions;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "h-9 inline-flex items-center whitespace-nowrap rounded-full px-5 text-sm font-medium transition-all duration-200",
              active
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.title}
          </Link>
        );
      })}
    </nav>
  );
}
