"use client";

import { ColumnDef, Row } from "@tanstack/react-table";
import { Check } from "lucide-react";
import { useAccount } from "wagmi";

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
import { Skeleton } from "@components/ui/Skeleton";
import { VoteDisplay } from "@components/ui/VoteDisplay";

import { useProposalHasVoted } from "@/hooks/use-proposal-has-voted";
import { sumVoteCounts } from "@/lib/vote-utils";
import { ParsedProposal } from "@/types/proposal";

function HasVotedCell({ proposal }: { proposal: ParsedProposal }) {
  const { isConnected } = useAccount();
  const { hasVoted, isLoadingHasVoted } = useProposalHasVoted({
    proposalId: proposal.id,
    governorAddress: proposal.contractAddress as `0x${string}`,
  });

  if (!isConnected || hasVoted === undefined) {
    if (isConnected && isLoadingHasVoted) {
      return <Skeleton className="h-5 w-16" />;
    }
    return <span className="text-xs text-muted-foreground">–</span>;
  }

  if (!hasVoted) {
    return <span className="text-xs text-muted-foreground">Not voted</span>;
  }

  return (
    <span
      className={
        "inline-flex items-center gap-1 rounded-md px-2.5 py-0.5 text-xs font-medium backdrop-blur-md " +
        "bg-emerald-500/10 text-emerald-700 border border-emerald-300/40 " +
        "dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-400/30"
      }
    >
      <Check className="h-3 w-3" />
      Voted
    </span>
  );
}

export const columns: ColumnDef<ParsedProposal>[] = [
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
    filterFn: (row, _id, value: string[]) => {
      if (!value?.length) return true;
      const rowState = row.original.state?.toLowerCase();
      return value.some((v) => v.toLowerCase() === rowState);
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
    id: "hasVoted",
    meta: {
      label: "Your Vote",
    },
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Your Vote" />
    ),
    cell: ({ row }: { row: Row<ParsedProposal> }) => (
      <HasVotedCell proposal={row.original} />
    ),
    size: 100,
  },
  {
    id: "vote",
    cell: ({ row }) => <DataTableRowActions row={row} />,
    size: 100,
  },
];
