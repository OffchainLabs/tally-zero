"use client";

import { ColumnDef, Row, Table } from "@tanstack/react-table";
import { BigNumber } from "ethers";
import { ExternalLinkIcon } from "lucide-react";
import Link from "next/link";

import { DataTableColumnHeader } from "@components/table/ColumnHeader";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@components/ui/HoverCard";

import { Skeleton } from "@/components/ui/Skeleton";
import type { TallyDelegateSummary } from "@/lib/delegate-cache";
import { getAddressExplorerUrl } from "@/lib/explorer-utils";
import { formatVotingPower, shortenAddress } from "@/lib/format-utils";
import { DelegateInfo } from "@/types/delegate";

declare module "@tanstack/react-table" {
  // TData is required for module augmentation but not used in this interface
  // biome-ignore lint: required for type augmentation
  interface TableMeta<TData> {
    totalVotingPower?: string;
    delegateSummaries?: Map<string, TallyDelegateSummary>;
    refreshedAddresses?: Set<string>;
  }
}

export const columns: ColumnDef<DelegateInfo>[] = [
  {
    id: "rank",
    meta: {
      label: "Rank",
    },
    header: "Rank",
    cell: ({ row }: { row: Row<DelegateInfo> }) => {
      return (
        <span className="flex h-7 items-center font-medium">
          {row.index + 1}
        </span>
      );
    },
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: "address",
    meta: {
      label: "Address",
    },
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Address" />
    ),
    cell: ({
      row,
      table,
    }: {
      row: Row<DelegateInfo>;
      table: Table<DelegateInfo>;
    }) => {
      const address = row.getValue("address") as string;
      const lowerAddress = address.toLowerCase();
      const isRefreshed =
        table.options.meta?.refreshedAddresses?.has(lowerAddress) ?? false;

      if (!isRefreshed) {
        // Hide identity until the row has resolved on-chain — the row may
        // shift to a different position in the page after the multicall sort
        // completes, and we don't want the user to see the wrong delegate
        // briefly attached to a rank. Heights match the rendered link below
        // (avatar 28px + truncated text) so the row doesn't jump.
        return (
          <div className="flex h-7 items-center gap-2">
            <Skeleton className="h-7 w-7 rounded-full" />
            <Skeleton className="h-4 w-32" />
          </div>
        );
      }

      const shortened = shortenAddress(address);
      const summary = table.options.meta?.delegateSummaries?.get(lowerAddress);
      const label = summary?.displayName;
      const profileHref = `/delegates/${lowerAddress}`;

      return (
        <HoverCard>
          <HoverCardTrigger asChild>
            <Link
              href={profileHref}
              className="inline-flex h-7 max-w-full items-center gap-2 font-medium text-foreground hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {summary?.picture && (
                // Delegate avatars are mirrored static assets, so a browser
                // image keeps table rendering simple and lazy-loaded.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={summary.picture}
                  alt=""
                  className="h-7 w-7 shrink-0 rounded-full bg-muted object-cover"
                  loading="lazy"
                />
              )}
              <span className="truncate">{label || shortened}</span>
            </Link>
          </HoverCardTrigger>
          <HoverCardContent className="w-full">
            <div className="space-y-2">
              {label && <p className="text-sm font-semibold">{label}</p>}
              <p className="text-sm font-mono break-all">{address}</p>
              <a
                href={getAddressExplorerUrl(address)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400 hover:underline"
              >
                View on Arbiscan
                <ExternalLinkIcon className="h-3 w-3" />
              </a>
            </div>
          </HoverCardContent>
        </HoverCard>
      );
    },
  },
  {
    accessorKey: "votingPower",
    meta: {
      label: "Voting Power",
    },
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Voting Power" />
    ),
    cell: ({
      row,
      table,
    }: {
      row: Row<DelegateInfo>;
      table: Table<DelegateInfo>;
    }) => {
      const address = (row.getValue("address") as string).toLowerCase();
      const isRefreshed =
        table.options.meta?.refreshedAddresses?.has(address) ?? false;

      if (!isRefreshed) {
        // Match the rendered cell's 28px content box so the row height
        // doesn't jump when the skeleton resolves.
        return (
          <div className="flex h-7 items-center">
            <Skeleton className="h-4 w-20" />
          </div>
        );
      }

      const votingPower = row.getValue("votingPower") as string;
      const formatted = formatVotingPower(votingPower);

      return (
        <span className="flex h-7 items-center font-medium">
          {formatted} ARB
        </span>
      );
    },
    sortingFn: (rowA, rowB, columnId) => {
      const a = rowA.getValue(columnId) as string;
      const b = rowB.getValue(columnId) as string;

      try {
        const aBN = BigNumber.from(a);
        const bBN = BigNumber.from(b);

        if (aBN.gt(bBN)) return 1;
        if (aBN.lt(bBN)) return -1;
        return 0;
      } catch {
        return a.localeCompare(b);
      }
    },
  },
  {
    id: "percentage",
    meta: {
      label: "% of Total",
    },
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="% of Total" />
    ),
    cell: ({
      row,
      table,
    }: {
      row: Row<DelegateInfo>;
      table: Table<DelegateInfo>;
    }) => {
      const address = (row.getValue("address") as string).toLowerCase();
      const isRefreshed =
        table.options.meta?.refreshedAddresses?.has(address) ?? false;

      if (!isRefreshed) {
        return (
          <div className="flex h-7 items-center">
            <Skeleton className="h-4 w-12" />
          </div>
        );
      }

      const votingPower = row.getValue("votingPower") as string;
      const totalVotingPower = table.options.meta?.totalVotingPower;

      if (!totalVotingPower || totalVotingPower === "0") {
        return (
          <span className="flex h-7 items-center text-muted-foreground">-</span>
        );
      }

      try {
        const delegatePower = BigNumber.from(votingPower);
        const totalPower = BigNumber.from(totalVotingPower);
        const percentage =
          (parseFloat(delegatePower.toString()) /
            parseFloat(totalPower.toString())) *
          100;

        return (
          <span className="flex h-7 items-center font-medium">
            {percentage.toFixed(2)}%
          </span>
        );
      } catch {
        return (
          <span className="flex h-7 items-center text-muted-foreground">-</span>
        );
      }
    },
  },
];
