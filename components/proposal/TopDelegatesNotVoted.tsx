"use client";

import { memo } from "react";

import { ExternalLinkIcon } from "@radix-ui/react-icons";

import { Badge } from "@/components/ui/Badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/Popover";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  useTopDelegatesNotVoted,
  type DelegateNotVoted,
} from "@/hooks/use-top-delegates-not-voted";
import { getAddressExplorerUrl } from "@/lib/explorer-utils";
import { formatVotingPower, shortenAddress } from "@/lib/format-utils";

interface TopDelegatesNotVotedProps {
  proposalId: string;
  governorAddress: string;
}

const DelegateBadge = memo(function DelegateBadge({
  delegate,
}: {
  delegate: DelegateNotVoted;
}) {
  const displayName = delegate.label || shortenAddress(delegate.address);
  const votingPower = formatVotingPower(delegate.votingPower);
  const arbiscanUrl = getAddressExplorerUrl(delegate.address);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 rounded-full"
        >
          <Badge
            variant="outline"
            className="text-xs py-0.5 px-2 backdrop-blur-sm bg-amber-500/20 text-amber-700 border-amber-500/30 dark:bg-amber-500/25 dark:text-amber-400 dark:border-amber-500/30 cursor-pointer hover:bg-amber-500/30 dark:hover:bg-amber-500/35 hover:scale-105 transition-all duration-200"
          >
            {displayName} · {votingPower}
          </Badge>
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-auto p-4 glass rounded-xl border-[var(--glass-border)]"
        align="start"
      >
        <div className="space-y-3">
          <div className="text-sm font-semibold">
            {delegate.label || "Delegate"}
          </div>
          <div className="font-mono text-xs text-muted-foreground break-all glass-subtle rounded-lg px-2 py-1.5">
            {delegate.address}
          </div>
          <div className="text-xs text-muted-foreground">
            Voting power: <span className="font-medium">{votingPower} ARB</span>
          </div>
          <a
            href={arbiscanUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors duration-200"
          >
            View on Arbiscan
            <ExternalLinkIcon className="h-3 w-3" />
          </a>
        </div>
      </PopoverContent>
    </Popover>
  );
});

export function TopDelegatesNotVoted({
  proposalId,
  governorAddress,
}: TopDelegatesNotVotedProps) {
  const { delegatesNotVoted, isLoading, error, allTopDelegatesVoted } =
    useTopDelegatesNotVoted({ proposalId, governorAddress, limit: 5 });

  if (isLoading) {
    return (
      <div className="glass-subtle rounded-xl px-3 py-2 mt-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground font-medium">
            Didn&apos;t vote:
          </span>
          <Skeleton className="h-5 w-24 rounded-full backdrop-blur-sm" />
          <Skeleton className="h-5 w-20 rounded-full backdrop-blur-sm" />
          <Skeleton className="h-5 w-16 rounded-full backdrop-blur-sm" />
        </div>
      </div>
    );
  }

  if (error || delegatesNotVoted.length === 0) {
    return null;
  }

  if (allTopDelegatesVoted) {
    return (
      <div className="glass-subtle rounded-xl px-3 py-2 mt-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant="secondary"
            className="text-xs py-0.5 px-2 backdrop-blur-sm bg-green-500/20 text-green-700 border border-green-500/30 dark:bg-green-500/25 dark:text-green-400 dark:border-green-500/30"
          >
            Top delegates have voted
          </Badge>
        </div>
      </div>
    );
  }

  return (
    <div className="glass-subtle rounded-xl px-3 py-2 mt-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground font-medium">
          Didn&apos;t vote:
        </span>
        {delegatesNotVoted.map((delegate) => (
          <DelegateBadge key={delegate.address} delegate={delegate} />
        ))}
      </div>
    </div>
  );
}
