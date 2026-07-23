"use client";

import type { ReactNode } from "react";

import { getBlockExplorerUrl } from "@/lib/explorer-utils";
import { ExternalLinkIcon } from "@radix-ui/react-icons";

import { formatVotingPeriodParts, type VotingTimeRange } from "./stage-utils";

export interface VotingPeriodPanelProps {
  range: VotingTimeRange;
  /** Optional status badges rendered under the date row */
  children?: ReactNode;
}

/**
 * Link a voting boundary date to its defining L1 block on Etherscan, so
 * users can verify the displayed time against the chain: mined blocks link
 * to the block page (exact timestamp), future blocks to the countdown page.
 */
function BoundaryBlockLink({
  blockNumber,
  isMined,
  boundary,
  children,
}: {
  blockNumber: number;
  isMined: boolean;
  boundary: "start" | "end";
  children: ReactNode;
}) {
  const blockLabel = `L1 block ${blockNumber.toLocaleString()}`;
  const title = isMined
    ? `Voting ${boundary}: ${blockLabel}. Verify the exact block timestamp on Etherscan.`
    : `Voting ${boundary}: ${blockLabel} (not mined yet). See the estimated countdown on Etherscan.`;

  return (
    <a
      href={getBlockExplorerUrl(blockNumber, "ethereum", {
        countdown: !isMined,
      })}
      target="_blank"
      rel="noopener noreferrer"
      title={title}
      aria-label={title}
      className="inline-flex items-center gap-0.5 underline decoration-dotted underline-offset-2 transition-colors hover:text-primary"
    >
      {children}
      <ExternalLinkIcon className="h-3 w-3 opacity-60" aria-hidden />
    </a>
  );
}

/**
 * Shared "Voting Period" box used by the stages UI and the vote summary
 * card, so every surface renders the voting window identically. Each date
 * links to its on-chain boundary block for verification.
 */
export function VotingPeriodPanel({ range, children }: VotingPeriodPanelProps) {
  const { start, end, startIsMined, endIsMined } =
    formatVotingPeriodParts(range);

  return (
    <div className="space-y-2 glass-subtle backdrop-blur rounded-lg px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="font-medium text-muted-foreground">Voting Period</span>
        <span className="flex flex-wrap items-center gap-1 text-foreground">
          <BoundaryBlockLink
            blockNumber={range.startBlock}
            isMined={startIsMined}
            boundary="start"
          >
            {start}
          </BoundaryBlockLink>
          <span aria-hidden>→</span>
          <BoundaryBlockLink
            blockNumber={range.endBlock}
            isMined={endIsMined}
            boundary="end"
          >
            {end}
          </BoundaryBlockLink>
        </span>
      </div>
      {children ? (
        <div className="flex flex-wrap gap-1.5">{children}</div>
      ) : null}
    </div>
  );
}
