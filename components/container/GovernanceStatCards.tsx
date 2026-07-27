"use client";

import { ArrowUpRight } from "lucide-react";

import { useDelegateCount } from "@/hooks/use-delegate-count";
import { cn } from "@/lib/utils";

/** Entropy Advisors' Arbitrum treasury dashboard. */
const TREASURY_DATA_URL = "https://arbdata.com/";

const compactNumber = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 2,
});

export interface GovernanceStatCardsProps {
  /** Proposals currently loaded by the table; null while it is still searching. */
  proposalCount: number | null;
}

/**
 * The three stat cards from the Figma frame "Proposals / Option w/ Banner and
 * Stats" (node 405:9982). Treasury has no onchain source in this app, so that
 * card links out to Entropy Advisors' dashboard instead of showing a figure.
 *
 * Delegates counts the addresses that clear the app-wide voting-power
 * threshold, matching the figure on /delegates. See `config/delegates.ts`.
 */
export function GovernanceStatCards({
  proposalCount,
}: GovernanceStatCardsProps) {
  // The governance indexer is env-configured and answers 503 when unset, so a
  // failure here is expected in local dev and must not surface as an error.
  const { data: delegateCount, isPending, isError } = useDelegateCount();

  const delegateValue =
    isPending && !isError
      ? null
      : delegateCount?.count
        ? compactNumber.format(delegateCount.count)
        : "N/A";

  return (
    <div className="rounded-2xl bg-white/[0.05] p-3 backdrop-blur-[15px] sm:p-5">
      <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
        <StatCard value={delegateValue} label="Delegates" />
        <StatCard
          value={proposalCount === null ? null : String(proposalCount)}
          label="Proposals"
        />
        <StatCard label="Treasury" className="sm:col-span-2 lg:col-span-1">
          <a
            href={TREASURY_DATA_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xl font-semibold leading-tight text-arb-brand transition-colors hover:text-arb-teal lg:text-2xl xl:text-3xl"
          >
            See the treasury on ArbData
            <ArrowUpRight className="size-5 shrink-0 lg:size-6" />
          </a>
        </StatCard>
      </div>
    </div>
  );
}

interface StatCardProps {
  label: string;
  /** Formatted figure. `null` renders a loading placeholder. */
  value?: string | null;
  /** Replaces the figure entirely (used by the treasury card). */
  children?: React.ReactNode;
  className?: string;
}

function StatCard({ label, value, children, className }: StatCardProps) {
  return (
    <div
      className={cn(
        "flex min-h-[120px] flex-col justify-center gap-2 rounded-2xl border border-arb-surface bg-white/[0.05] p-6 sm:min-h-[180px] sm:p-8 lg:min-h-[180px] lg:p-6",
        className
      )}
    >
      {children ?? (
        <p className="text-4xl font-bold uppercase leading-none tracking-tight text-[#e8f0f8] sm:text-5xl lg:text-[84px]">
          {value === null || value === undefined ? (
            <>
              <span
                aria-hidden="true"
                className="inline-block h-[0.8em] w-[3ch] animate-pulse rounded bg-white/10 align-middle"
              />
              <span className="sr-only">Loading</span>
            </>
          ) : (
            value
          )}
        </p>
      )}
      <p className="text-sm uppercase text-[#e8f0f8]/50">{label}</p>
    </div>
  );
}
