"use client";

import { ColumnDef, Row } from "@tanstack/react-table";

import { VoteDistributionBarCompact } from "@components/proposal/stages/VoteDistributionBarCompact";
import { DataTableColumnHeader } from "@components/table/ColumnHeader";
import { QuorumCell } from "@components/table/QuorumCell";
import { DataTableRowActions } from "@components/table/RowActions";
import { ClickableDescriptionCell } from "@components/ui/DescriptionCell";
import { GovernorBadge } from "@components/ui/GovernorBadge";
import { HasVotedBadge } from "@components/ui/HasVotedBadge";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@components/ui/HoverCard";
import { LifecycleCell } from "@components/ui/LifecycleCell";
import { VoteDisplay } from "@components/ui/VoteDisplay";

import { formatShortDate } from "@/lib/date-utils";
import { ParsedProposal } from "@/types/proposal";

export const columns: ColumnDef<ParsedProposal>[] = [
  {
    accessorKey: "proposalNumber",
    meta: {
      label: "Proposal #",
    },
    header: ({ column }) => <DataTableColumnHeader column={column} title="#" />,
    cell: ({ row }: { row: Row<ParsedProposal> }) => {
      const { proposalNumber } = row.original;
      if (proposalNumber === undefined) return null;
      return (
        <span className="tabular-nums text-muted-foreground whitespace-nowrap">
          {proposalNumber}
        </span>
      );
    },
    sortUndefined: "last",
    size: 60,
  },
  {
    accessorKey: "createdAtTimestamp",
    meta: {
      label: "Created",
    },
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Created" />
    ),
    cell: ({ row }: { row: Row<ParsedProposal> }) => {
      const { createdAtTimestamp } = row.original;
      if (!createdAtTimestamp) return null;
      return (
        <time
          dateTime={new Date(createdAtTimestamp * 1000).toISOString()}
          className="tabular-nums whitespace-nowrap text-muted-foreground"
        >
          {formatShortDate(createdAtTimestamp)}
        </time>
      );
    },
    sortUndefined: "last",
    size: 124,
  },
  {
    // No fixed size: with table-fixed, the one unsized column takes every
    // pixel the sized columns leave over, so wider screens widen the title
    // instead of sharing the gain across all columns and truncating it.
    // minSize is the floor DataTable turns into the table's min-width, so a
    // narrow viewport scrolls the table rather than squeezing the title.
    accessorKey: "description",
    meta: {
      label: "Proposal",
    },
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Proposal" />
    ),
    cell: ({ row }: { row: Row<ParsedProposal> }) => (
      <ClickableDescriptionCell proposal={row.original} />
    ),
    minSize: 400,
  },
  {
    accessorKey: "governorName",
    meta: {
      label: "Governor",
    },
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Governor" />
    ),
    cell: ({ row }: { row: Row<ParsedProposal> }) => {
      const { governorName } = row.original;
      if (!governorName) return null;
      return <GovernorBadge governorName={governorName} />;
    },
    size: 112,
  },
  {
    accessorKey: "lifecycle",
    meta: {
      label: "Status",
    },
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Status" />
    ),
    cell: ({ row }: { row: Row<ParsedProposal> }) => {
      return <LifecycleCell proposal={row.original} />;
    },
    filterFn: (row, _id, value: string[]) => {
      if (!value?.length) return true;
      const rowState = row.original.state?.toLowerCase();
      return value.some((v) => v.toLowerCase() === rowState);
    },
    size: 128,
  },
  {
    accessorKey: "votes",
    meta: {
      label: "Votes",
    },
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Votes" />
    ),
    cell: ({ row }: { row: Row<ParsedProposal> }) => {
      const votes = row.original.votes;

      return (
        <HoverCard>
          <HoverCardTrigger className="cursor-pointer">
            <VoteDistributionBarCompact votes={votes} />
          </HoverCardTrigger>
          <HoverCardContent className="w-auto glass rounded-xl">
            <VoteDisplay votes={votes} />
          </HoverCardContent>
        </HoverCard>
      );
    },
    size: 132,
  },
  {
    id: "quorum",
    meta: {
      label: "Quorum",
    },
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Quorum" />
    ),
    cell: ({ row }: { row: Row<ParsedProposal> }) => (
      <QuorumCell proposal={row.original} />
    ),
    size: 124,
  },
  {
    id: "hasVoted",
    meta: {
      label: "Your Vote",
    },
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Your Vote" />
    ),
    cell: ({ row }: { row: Row<ParsedProposal> }) => (
      <HasVotedBadge proposal={row.original} showPlaceholder />
    ),
    size: 104,
  },
  {
    id: "vote",
    cell: ({ row }) => <DataTableRowActions row={row} />,
    size: 56,
  },
];
