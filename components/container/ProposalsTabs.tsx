"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

type ProposalView = "proposals" | "drafts";

const VIEWS: { id: ProposalView; href: string; label: string }[] = [
  { id: "proposals", href: "/proposals", label: "Proposals" },
  { id: "drafts", href: "/drafts", label: "My Drafts" },
];

const VIEW_LINK_CLASS =
  "inline-flex h-9 items-center rounded-full px-5 text-sm font-medium transition-all duration-200";

export interface ProposalsTabsProps {
  /** Content shown below the navigation. */
  children: ReactNode;
  active?: ProposalView;
}

/**
 * Segmented navigation shared by the home, proposals, and drafts pages.
 * Links keep both views directly accessible and bookmarkable.
 */
export function ProposalsTabs({
  children,
  active = "proposals",
}: ProposalsTabsProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <nav
          aria-label="Proposal views"
          className="inline-flex items-center gap-1 rounded-full glass-subtle backdrop-blur p-1"
        >
          {VIEWS.map(({ id, href, label }) => (
            <Link
              key={id}
              href={href}
              aria-current={active === id ? "true" : undefined}
              className={cn(
                VIEW_LINK_CLASS,
                active === id
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {label}
            </Link>
          ))}
        </nav>

        {active === "proposals" ? (
          <Button asChild size="sm" variant="outline">
            <Link href="/proposal/new">
              <Plus className="h-3.5 w-3.5 mr-1" />
              New Proposal
            </Link>
          </Button>
        ) : null}
      </div>

      {children}
    </div>
  );
}
