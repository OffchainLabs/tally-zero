"use client";

import { ColumnDef, Row, Table } from "@tanstack/react-table";
import { BigNumber } from "ethers";
import { ExternalLinkIcon } from "lucide-react";

import { DataTableColumnHeader } from "@components/table/ColumnHeader";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@components/ui/HoverCard";

import { getAddressExplorerUrl } from "@/lib/explorer-utils";
import { formatVotingPower, shortenAddress } from "@/lib/format-utils";
import type { TallyDelegateSummary } from "@/lib/tally-data";
import { DelegateInfo } from "@/types/delegate";

declare module "@tanstack/react-table" {
  // TData is required for module augmentation but not used in this interface
  // biome-ignore lint: required for type augmentation
  interface TableMeta<TData> {
    totalVotingPower?: string;
    delegateSummaries?: Map<string, TallyDelegateSummary>;
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
      return <span className="font-medium">{row.index + 1}</span>;
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
      const shortened = shortenAddress(address);
      const summary = table.options.meta?.delegateSummaries?.get(
        address.toLowerCase()
      );
      const label = summary?.displayName;

      return (
        <HoverCard>
          <HoverCardTrigger asChild>
            <span className="inline-flex items-center gap-2 cursor-default">
              {label || shortened}
            </span>
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
    cell: ({ row }: { row: Row<DelegateInfo> }) => {
      const votingPower = row.getValue("votingPower") as string;
      const formatted = formatVotingPower(votingPower);

      return <span className="font-medium">{formatted} ARB</span>;
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
      const votingPower = row.getValue("votingPower") as string;
      const totalVotingPower = table.options.meta?.totalVotingPower;

      if (!totalVotingPower || totalVotingPower === "0") {
        return <span className="text-muted-foreground">-</span>;
      }

      try {
        const delegatePower = BigNumber.from(votingPower);
        const totalPower = BigNumber.from(totalVotingPower);
        const percentage =
          (parseFloat(delegatePower.toString()) /
            parseFloat(totalPower.toString())) *
          100;

        return <span className="font-medium">{percentage.toFixed(2)}%</span>;
      } catch {
        return <span className="text-muted-foreground">-</span>;
      }
    },
  },
];
