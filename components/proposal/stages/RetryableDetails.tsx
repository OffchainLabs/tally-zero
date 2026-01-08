"use client";

import { memo } from "react";

import type { Chain } from "@gzeoneth/gov-tracker";
import { ExternalLinkIcon } from "@radix-ui/react-icons";

import { getStageTxExplorerUrl } from "./stage-utils";

// L2 chain types - derived from gov-tracker's Chain type
type L2Chain = Exclude<Chain, "ethereum" | "unknown">;

export interface RetryableCreationDetailsProps {
  details: Array<{
    index: number;
    targetChain: L2Chain;
    l2TxHash: string | null;
  }>;
}

export const RetryableCreationDetails = memo(function RetryableCreationDetails({
  details,
}: RetryableCreationDetailsProps) {
  const createdCount = details.filter((d) => d.l2TxHash).length;

  return (
    <div className="space-y-1 mt-1">
      <p className="text-muted-foreground">
        Retryable tickets created: {createdCount}/{details.length}
      </p>
      {details
        .filter((d) => d.l2TxHash)
        .map((detail) => (
          <div
            key={`creation-${detail.index}`}
            className="flex items-center gap-2"
          >
            <span className="text-xs px-1 py-0.5 rounded bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300">
              {detail.targetChain === "arb1" ? "Arb1" : "Nova"}
            </span>
            <a
              href={getStageTxExplorerUrl(detail.l2TxHash!, detail.targetChain)}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
            >
              {detail.l2TxHash!.slice(0, 10)}...
              {detail.l2TxHash!.slice(-8)}
              <ExternalLinkIcon className="h-3 w-3" />
            </a>
          </div>
        ))}
    </div>
  );
});

export interface RetryableRedemptionDetailsProps {
  details: Array<{
    index: number;
    targetChain: L2Chain;
    status: string;
    l2TxHash: string | null;
  }>;
}

export const RetryableRedemptionDetails = memo(
  function RetryableRedemptionDetails({
    details,
  }: RetryableRedemptionDetailsProps) {
    const redeemedCount = details.filter((d) => d.l2TxHash).length;

    return (
      <div className="space-y-1 mt-1">
        <p className="text-muted-foreground">
          Redemptions: {redeemedCount}/{details.length}
        </p>
        {details.map((detail) => (
          <div
            key={`redemption-${detail.index}`}
            className="flex items-center gap-2"
          >
            <span className="text-xs px-1 py-0.5 rounded bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300">
              {detail.targetChain === "arb1" ? "Arb1" : "Nova"}
            </span>
            {detail.l2TxHash ? (
              <a
                href={getStageTxExplorerUrl(
                  detail.l2TxHash,
                  detail.targetChain
                )}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
              >
                {detail.l2TxHash.slice(0, 10)}...
                {detail.l2TxHash.slice(-8)}
                <ExternalLinkIcon className="h-3 w-3" />
              </a>
            ) : (
              <span className="text-muted-foreground">{detail.status}</span>
            )}
          </div>
        ))}
      </div>
    );
  }
);
