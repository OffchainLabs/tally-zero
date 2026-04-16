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
import { VoteDisplay } from "@components/ui/VoteDisplay";

import { sumVoteCounts } from "@/lib/vote-utils";
import { ParsedProposal } from "@/types/proposal";

export const columns: ColumnDef<ParsedProposal>[] = [
  {
    accessorKey: "proposer",
    meta: {
      label: "Proposer",
    },
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Proposer" />
    ),
    cell: ({ row }) => (
      <div className="flex space-x-2 shrink-0">
        <ProposerCell proposer={row.getValue("proposer")} />
      </div>
    ),
    size: 140,
  },
  {
    accessorKey: "description",
    meta: {
      label: "Proposal",
    },
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
    size: 90,
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
    size: 100,
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

      // Calculate votes toward quorum (only For + Abstain count, not Against)
      const votesTowardQuorum = sumVoteCounts(
        votes?.forVotes,
        votes?.abstainVotes
      );

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
