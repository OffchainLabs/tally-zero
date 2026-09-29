"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

type ProposalView = "proposals" | "drafts";

const VIEW_LINK_CLASS =
  "inline-flex h-9 items-center rounded-full px-5 text-sm font-medium transition-all duration-200";

export interface ProposalsTabsProps {
  /** Content shown below the navigation. */
  children: ReactNode;
  active?: ProposalView;
  showNewProposal?: boolean;
}

/**
 * Segmented navigation shared by the home, proposals, and drafts pages.
 * Links keep both views directly accessible and bookmarkable.
 */
export function ProposalsTabs({
  children,
  active = "proposals",
  showNewProposal = true,
}: ProposalsTabsProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <nav
          aria-label="Proposal views"
          className="inline-flex items-center gap-1 rounded-full glass-subtle backdrop-blur p-1"
        >
          <Link
            href="/proposals"
            aria-current={active === "proposals" ? "true" : undefined}
            className={cn(
              VIEW_LINK_CLASS,
              active === "proposals"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Proposals
          </Link>
          <Link
            href="/drafts"
            aria-current={active === "drafts" ? "true" : undefined}
            className={cn(
              VIEW_LINK_CLASS,
              active === "drafts"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            My Drafts
          </Link>
        </nav>

        {active === "proposals" && showNewProposal ? (
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
