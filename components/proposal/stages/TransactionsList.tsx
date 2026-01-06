"use client";

import { memo } from "react";

import { formatRelativeTimestamp } from "@/lib/date-utils";
import type { ChainType } from "@gzeoneth/gov-tracker";
import { ExternalLinkIcon } from "@radix-ui/react-icons";

import { getStageTxExplorerUrl } from "./stage-utils";

export interface TransactionsListProps {
  transactions: Array<{
    hash: string;
    chain: ChainType;
    timestamp?: number;
    targetChain?: "Arb1" | "Nova";
  }>;
}

export const TransactionsList = memo(function TransactionsList({
  transactions,
}: TransactionsListProps) {
  return (
    <div className="mt-2 space-y-1">
      {transactions.map((tx, idx) => (
        <div
          key={`${tx.hash}-${idx}`}
          className="flex items-center gap-2 text-xs"
        >
          <a
            href={getStageTxExplorerUrl(tx.hash, tx.chain, tx.targetChain)}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
          >
            {tx.hash.slice(0, 10)}...{tx.hash.slice(-8)}
            <ExternalLinkIcon className="h-3 w-3" />
          </a>
          {tx.timestamp && (
            <span className="text-muted-foreground">
              {formatRelativeTimestamp(tx.timestamp)}
            </span>
          )}
        </div>
      ))}
    </div>
  );
});
