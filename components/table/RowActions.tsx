"use client";

import { DotsHorizontalIcon } from "@radix-ui/react-icons";
import { Row } from "@tanstack/react-table";
import Link from "next/link";
import { memo } from "react";

import { Button } from "@components/ui/Button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@components/ui/DropdownMenu";

import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { buildProposalPath } from "@/lib/proposal-url";
import { proposalSchema } from "@config/schema";

interface DataTableRowActionsProps<TData> {
  row: Row<TData>;
}

/**
 * Row actions dropdown for proposal actions.
 */
function DataTableRowActionsComponent<TData>({
  row,
}: DataTableRowActionsProps<TData>) {
  const proposal = proposalSchema.parse(row.original);
  const { copied, copy } = useCopyToClipboard();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="flex h-8 w-8 p-0 transition-all duration-200 hover:bg-white/20 dark:hover:bg-white/10 data-[state=open]:bg-white/20 dark:data-[state=open]:bg-white/10"
        >
          <DotsHorizontalIcon className="w-4 h-4 " />
          <span className="sr-only" data-state={proposal.state}>
            View proposal
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-[200px] glass-subtle rounded-lg"
      >
        <DropdownMenuItem
          asChild
          className="transition-all duration-200 hover:bg-white/20 dark:hover:bg-white/10"
        >
          <Link
            href={buildProposalPath({
              proposalId: proposal.id,
              governorAddress: proposal.contractAddress,
            })}
          >
            <span>
              View Proposal <span className="sr-only">{proposal.id}</span>
            </span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem
          className="transition-all duration-200 hover:bg-white/20 dark:hover:bg-white/10"
          onClick={() => copy(proposal.id.toString())}
        >
          {copied ? "Copied!" : "Copy Proposal ID"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export const DataTableRowActions = memo(
  DataTableRowActionsComponent
) as typeof DataTableRowActionsComponent;
