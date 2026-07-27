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
    <div className="rounded-2xl bg-white/[0.05] p-2 backdrop-blur-[15px] sm:p-3">
      <div className="grid h-full gap-2 sm:grid-cols-3">
        <StatCard
          value={delegateValue}
          label="Delegates with ≥5000 ARB voting power"
        />
        <StatCard
          value={proposalCount === null ? null : String(proposalCount)}
          label="Proposals"
        />
        <StatCard label="Treasury">
          <a
            href={TREASURY_DATA_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-start gap-1 text-sm font-semibold leading-tight text-arb-brand transition-colors hover:text-arb-teal xl:text-base"
          >
            See the treasury on ArbData
            <ArrowUpRight className="size-4 shrink-0" />
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
        "flex min-h-[104px] flex-col justify-center gap-1 rounded-xl border border-arb-surface bg-white/[0.05] p-4 sm:min-h-[116px]",
        className
      )}
    >
      {children ?? (
        <p className="text-3xl font-bold uppercase leading-none tracking-tight text-[#e8f0f8] xl:text-4xl">
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
      <p className="text-xs uppercase text-[#e8f0f8]/50">{label}</p>
    </div>
  );
}
