"use client";

import { ReloadIcon } from "@radix-ui/react-icons";
import Link from "next/link";
import { useState } from "react";

import { AddressAvatar } from "@/components/ui/AddressAvatar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  uniqueByAddress,
  useCurrentDelegators,
  useFormerDelegators,
} from "@/hooks/use-delegate-delegators";
import { formatRelativeTimestamp } from "@/lib/date-utils";
import type {
  TallyAddressDisplayRecord,
  TallyDelegator,
  TallyFormerDelegator,
} from "@/lib/delegate-cache";
import { getTxExplorerUrl } from "@/lib/explorer-utils";
import { formatVotingPower, shortenAddress } from "@/lib/format-utils";
import { cn } from "@/lib/utils";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

type View = "current" | "former";

interface DelegatorsCardProps {
  address: string;
  /** The delegate's voting power in wei, for each delegator's share. */
  votingPower: string | null;
}

export function DelegatorsCard({ address, votingPower }: DelegatorsCardProps) {
  const [view, setView] = useState<View>("current");

  return (
    <Card variant="glass">
      <CardContent className="space-y-4 pt-6">
        <div
          role="group"
          aria-label="Delegators to show"
          className="inline-flex rounded-lg p-1 glass-subtle"
        >
          <ViewButton
            active={view === "current"}
            onClick={() => setView("current")}
          >
            Current
          </ViewButton>
          <ViewButton
            active={view === "former"}
            onClick={() => setView("former")}
          >
            Former
          </ViewButton>
        </div>

        {view === "current" ? (
          <CurrentDelegators address={address} votingPower={votingPower} />
        ) : (
          <FormerDelegators address={address} />
        )}
      </CardContent>
    </Card>
  );
}

function ViewButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "rounded-md px-3 py-1 text-sm transition-colors",
        active
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}

function CurrentDelegators({
  address,
  votingPower,
}: {
  address: string;
  votingPower: string | null;
}) {
  const query = useCurrentDelegators(address);
  const pages = query.data?.pages ?? [];
  const rows = uniqueByAddress(pages.flatMap((page) => page.delegators));
  const totalCount = pages[0]?.totalCount ?? 0;
  const balancesUnavailable =
    pages.length > 0 && pages[0].balancesAsOfBlock === null;

  return (
    <DelegatorList
      query={query}
      totalCount={totalCount}
      loadedCount={rows.length}
      emptyMessage="No one delegates to this address right now."
      note={
        balancesUnavailable && totalCount > 0
          ? "Balances couldn't be read from the chain right now. Try again in a minute."
          : undefined
      }
    >
      {rows.map((row) => (
        <CurrentRow
          key={row.address}
          row={row}
          isSelf={row.address.toLowerCase() === address.toLowerCase()}
          votingPower={votingPower}
        />
      ))}
    </DelegatorList>
  );
}

function FormerDelegators({ address }: { address: string }) {
  const query = useFormerDelegators(address);
  const pages = query.data?.pages ?? [];
  const rows = uniqueByAddress(pages.flatMap((page) => page.delegators));

  return (
    <DelegatorList
      query={query}
      totalCount={pages[0]?.totalCount ?? 0}
      loadedCount={rows.length}
      emptyMessage="No one has moved their delegation away from this address."
    >
      {rows.map((row) => (
        <FormerRow key={row.address} row={row} />
      ))}
    </DelegatorList>
  );
}

type ListQuery = {
  isPending: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => unknown;
  isFetching: boolean;
  hasNextPage: boolean;
  fetchNextPage: () => unknown;
  isFetchingNextPage: boolean;
};

function DelegatorList({
  query,
  totalCount,
  loadedCount,
  emptyMessage,
  note,
  children,
}: {
  query: ListQuery;
  totalCount: number;
  loadedCount: number;
  emptyMessage: string;
  note?: string;
  children: React.ReactNode;
}) {
  if (query.isPending) {
    return (
      <ul className="space-y-2" aria-label="Loading delegators">
        {Array.from({ length: 5 }).map((_, i) => (
          <RowSkeleton key={i} />
        ))}
      </ul>
    );
  }

  if (query.isError) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-destructive">
          Failed to load delegators: {query.error?.message ?? "Unknown error"}
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => query.refetch()}
          disabled={query.isFetching}
        >
          {query.isFetching && (
            <ReloadIcon className="mr-2 h-4 w-4 animate-spin" />
          )}
          Retry
        </Button>
      </div>
    );
  }

  if (totalCount === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        {emptyMessage}
      </p>
    );
  }

  const remaining = Math.max(0, totalCount - loadedCount);

  return (
    <div>
      <header className="mb-2 border-b border-border/40 pb-2 text-xs text-muted-foreground">
        {totalCount.toLocaleString()} address{totalCount === 1 ? "" : "es"}
      </header>
      {note && <p className="mb-2 text-xs text-muted-foreground">{note}</p>}

      <ul className="divide-y divide-border/30">{children}</ul>

      {query.hasNextPage && (
        <div className="mt-3 flex justify-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => query.fetchNextPage()}
            disabled={query.isFetchingNextPage}
          >
            {query.isFetchingNextPage && (
              <ReloadIcon className="mr-2 h-4 w-4 animate-spin" />
            )}
            Load more ({remaining.toLocaleString()} remaining)
          </Button>
        </div>
      )}
    </div>
  );
}

function Identity({
  address,
  display,
}: {
  address: string;
  display: TallyAddressDisplayRecord | undefined;
}) {
  const label = display?.label ?? null;
  return (
    <Link
      href={display?.profileUrl ?? `/delegates/${address.toLowerCase()}`}
      className="flex min-w-0 items-center gap-2.5 hover:underline"
      title={address}
    >
      <AddressAvatar picture={display?.picture ?? null} />
      <span className="truncate text-sm">
        {label ?? shortenAddress(address)}
      </span>
    </Link>
  );
}

function CurrentRow({
  row,
  isSelf,
  votingPower,
}: {
  row: TallyDelegator;
  isSelf: boolean;
  votingPower: string | null;
}) {
  const share =
    row.balance === null ? null : formatShare(row.balance, votingPower);
  return (
    <li className="flex items-center justify-between gap-3 px-2 py-2">
      <div className="flex min-w-0 flex-col gap-0.5">
        <div className="flex min-w-0 items-center gap-2">
          <Identity address={row.address} display={row.display} />
          {isSelf && (
            <Badge variant="outline" className="shrink-0 text-[10px]">
              Self
            </Badge>
          )}
        </div>
        <a
          href={getTxExplorerUrl(row.txHash)}
          target="_blank"
          rel="noopener noreferrer"
          className="pl-[34px] text-xs text-muted-foreground hover:underline"
        >
          Since {formatRelativeTimestamp(Number(row.delegatedAtTimestamp))}
        </a>
      </div>
      <div className="shrink-0 text-right">
        {row.balance === null ? (
          <span className="text-xs text-muted-foreground">Unavailable</span>
        ) : (
          <>
            <p className="text-sm tabular-nums">
              {formatVotingPower(row.balance)} ARB
            </p>
            {share && (
              <p className="text-xs tabular-nums text-muted-foreground">
                {share}
              </p>
            )}
          </>
        )}
      </div>
    </li>
  );
}

function FormerRow({ row }: { row: TallyFormerDelegator }) {
  const undelegated = row.nowDelegatesTo.toLowerCase() === ZERO_ADDRESS;
  const destination = undelegated
    ? null
    : (row.nowDelegatesToDisplay?.label ?? shortenAddress(row.nowDelegatesTo));
  return (
    <li className="flex items-center justify-between gap-3 px-2 py-2">
      <div className="flex min-w-0 flex-col gap-0.5">
        <Identity address={row.address} display={row.display} />
        <p className="truncate pl-[34px] text-xs text-muted-foreground">
          <a
            href={getTxExplorerUrl(row.leftTxHash)}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:underline"
          >
            Left {formatRelativeTimestamp(Number(row.leftAtTimestamp))}
          </a>
          {" · "}
          {undelegated ? (
            "Undelegated"
          ) : (
            <>
              Now delegates to{" "}
              <Link
                href={
                  row.nowDelegatesToDisplay?.profileUrl ??
                  `/delegates/${row.nowDelegatesTo.toLowerCase()}`
                }
                className="hover:underline"
              >
                {destination}
              </Link>
            </>
          )}
        </p>
      </div>
      <p className="shrink-0 text-right text-sm tabular-nums text-muted-foreground">
        {row.amountRemoved === "0"
          ? "0 ARB"
          : `−${formatVotingPower(row.amountRemoved)} ARB`}
      </p>
    </li>
  );
}

function RowSkeleton() {
  return (
    <li className="flex items-center justify-between py-2">
      <div className="flex items-center gap-2.5">
        <Skeleton className="h-6 w-6 rounded-full" />
        <Skeleton className="h-4 w-32" />
      </div>
      <Skeleton className="h-3 w-16" />
    </li>
  );
}

/**
 * A delegator's balance as a share of the delegate's voting power, to two
 * decimals. Null when the voting power is unknown or zero.
 */
export function formatShare(
  balance: string,
  votingPower: string | null
): string | null {
  if (!votingPower) return null;
  try {
    const total = BigInt(votingPower);
    const part = BigInt(balance);
    if (total <= BigInt(0)) return null;
    if (part <= BigInt(0)) return "0%";
    const basisPoints = (part * BigInt(10_000)) / total;
    if (basisPoints === BigInt(0)) return "<0.01%";
    // Balances are read later than the voting power, so one can briefly exceed it.
    const capped = basisPoints > BigInt(10_000) ? BigInt(10_000) : basisPoints;
    return `${(Number(capped) / 100).toFixed(2).replace(/\.?0+$/, "")}%`;
  } catch {
    return null;
  }
}
