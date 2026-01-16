"use client";

import { ColumnDef, Row } from "@tanstack/react-table";

import { ProposerCell } from "@components/container/ProposerCell";
import { QuorumIndicator } from "@components/proposal/stages/QuorumIndicator";
import { VoteDistributionBarCompact } from "@components/proposal/stages/VoteDistributionBarCompact";
import { DataTableColumnHeader } from "@components/table/ColumnHeader";
import { DataTableRowActions } from "@components/table/RowActions";
import { ClickableDescriptionCell } from "@components/ui/DescriptionCell";
import { GovernorBadge } from "@components/ui/GovernorBadge";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@components/ui/HoverCard";
import { LifecycleCell } from "@components/ui/LifecycleCell";
import { StatusBadgeGlass } from "@components/ui/StatusBadgeGlass";
import { VoteDisplay } from "@components/ui/VoteDisplay";

import { ParsedProposal, ProposalStateName } from "@/types/proposal";

export const columns: ColumnDef<ParsedProposal>[] = [
  {
    accessorKey: "id",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="ID" />
    ),
    cell: ({ row }: { row: Row<ParsedProposal> }) => {
      const id = row.getValue("id") as string;

      return id.length < 6 ? (
        <span className="text-xs text-foreground/90 font-mono">{id}</span>
      ) : (
        <HoverCard>
          <HoverCardTrigger className="underline hover:font-semibold hover:cursor-pointer transition-transform duration-200 ease-in-out transform hover:scale-105 text-xs text-foreground/90 font-mono">
            {`${id.substring(0, 5)}...${id.substring(id.length - 2)}`}
          </HoverCardTrigger>
          <HoverCardContent className="w-full font-mono text-xs">
            {id}
          </HoverCardContent>
        </HoverCard>
      );
    },
    size: 70,
    enableHiding: false,
  },
  {
    accessorKey: "proposer",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Proposer" />
    ),
    cell: ({ row }) => (
      <div className="flex space-x-2">
        <ProposerCell proposer={row.getValue("proposer")} />
      </div>
    ),
    size: 120,
  },
  {
    accessorKey: "description",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Proposal" />
    ),
    cell: ({ row }: { row: Row<ParsedProposal> }) => {
      return (
        <div className="min-w-[300px] lg:min-w-[400px] xl:min-w-[500px]">
          <ClickableDescriptionCell proposal={row.original} />
        </div>
      );
    },
    size: 500,
  },
  {
    accessorKey: "governorName",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Governor" />
    ),
    cell: ({ row }: { row: Row<ParsedProposal> }) => {
      const { governorName } = row.original;
      if (!governorName) return null;
      return <GovernorBadge governorName={governorName} />;
    },
    size: 90,
  },
  {
    accessorKey: "state",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="State" />
    ),
    cell: ({ row }: { row: Row<ParsedProposal> }) => {
      const state = row.getValue("state") as ProposalStateName;
      if (!state) return null;

      return <StatusBadgeGlass state={state} />;
    },
    filterFn: (row, id, value: string[]) => {
      const rowState = (row.getValue(id) as string)?.toLowerCase();
      return value.some((v) => v.toLowerCase() === rowState);
    },
    size: 90,
  },
  {
    accessorKey: "lifecycle",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Status" />
    ),
    cell: ({ row }: { row: Row<ParsedProposal> }) => {
      return <LifecycleCell proposal={row.original} />;
    },
    size: 100,
  },
  {
    accessorKey: "votes",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Votes" />
    ),
    cell: ({ row }: { row: Row<ParsedProposal> }) => {
      const votes = row.original.votes;

      // Calculate votes toward quorum (only For + Abstain count, not Against)
      const votesTowardQuorum =
        votes?.forVotes && votes?.abstainVotes
          ? (BigInt(votes.forVotes) + BigInt(votes.abstainVotes)).toString()
          : "0";

      return (
        <div className="flex items-center gap-3">
          <HoverCard>
            <HoverCardTrigger className="cursor-pointer">
              <VoteDistributionBarCompact votes={votes} />
            </HoverCardTrigger>
            <HoverCardContent className="w-auto glass rounded-xl">
              <VoteDisplay votes={votes} />
            </HoverCardContent>
          </HoverCard>
          {votes?.quorum && (
            <div className="hidden xl:block">
              <QuorumIndicator
                current={votesTowardQuorum}
                required={votes.quorum}
              />
            </div>
          )}
        </div>
      );
    },
    size: 180,
  },
  {
    id: "vote",
    cell: ({ row }) => <DataTableRowActions row={row} />,
    size: 100,
  },
];
