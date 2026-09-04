"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";

import MyDraftsList from "@/components/container/MyDraftsList";
import { cn } from "@/lib/utils";
import { Button } from "@components/ui/Button";

type ProposalsTab = "proposals" | "drafts";

const TABS: { id: ProposalsTab; label: string }[] = [
  { id: "proposals", label: "Proposals" },
  { id: "drafts", label: "My Drafts" },
];

export interface ProposalsTabsProps {
  /** Content shown under the "Proposals" tab, usually the proposals table. */
  children: ReactNode;
}

/**
 * Segmented "Proposals / My Drafts" switcher plus the "New Proposal" action,
 * over either the caller's proposals content or the signed-in user's server
 * drafts. Shared by the home page and the proposals page so both get the same
 * nav above their table.
 */
export function ProposalsTabs({ children }: ProposalsTabsProps) {
  const [tab, setTab] = useState<ProposalsTab>("proposals");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label="Proposal views"
          className="inline-flex items-center gap-1 rounded-full glass-subtle backdrop-blur p-1"
        >
          {TABS.map(({ id, label }) => {
            const active = tab === id;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(id)}
                className={cn(
                  "h-9 rounded-full px-5 text-sm font-medium transition-all duration-200",
                  active
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {label}
              </button>
            );
          })}
        </div>

        <Button asChild size="sm" variant="outline">
          <Link href="/proposal/new">
            <Plus className="h-3.5 w-3.5 mr-1" />
            New Proposal
          </Link>
        </Button>
      </div>

      {tab === "proposals" ? children : <MyDraftsList />}
    </div>
  );
}
