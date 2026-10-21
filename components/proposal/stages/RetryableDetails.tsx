"use client";

import { memo } from "react";

import type { Chain, L2Chain } from "@gzeoneth/gov-tracker";
import { ExternalLinkIcon } from "@radix-ui/react-icons";

import { RedeemRetryableButton } from "./RedeemRetryableButton";
import { getStageTxExplorerUrl } from "./stage-utils";

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
            <span className="text-xs px-1 py-0.5 rounded bg-arb-blue/15 text-arb-blue dark:bg-arb-navy/60 dark:text-arb-teal">
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
    /** Set by the indexer; a REDEEMABLE ticket with one gets a Redeem button */
    ticketId?: string | null;
    /** Set by the indexer: the L1 transaction that created the ticket */
    creationTxHash?: string | null;
    /** The creation transaction's explorer chain; "unknown" has no explorer */
    creationChain?: Chain;
  }>;
  /** Called after a manual redeem is mined */
  onRedeemed?: () => void;
}

export const RetryableRedemptionDetails = memo(
  function RetryableRedemptionDetails({
    details,
    onRedeemed,
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
            data-ticket-id={detail.ticketId ?? undefined}
            data-status={detail.status}
          >
            <span className="text-xs px-1 py-0.5 rounded bg-arb-blue/15 text-arb-blue dark:bg-arb-navy/60 dark:text-arb-teal">
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
            {detail.creationTxHash && (
              <CreationTxLink
                hash={detail.creationTxHash}
                chain={detail.creationChain ?? "ethereum"}
              />
            )}
            {detail.status === "REDEEMABLE" && detail.ticketId && (
              <RedeemRetryableButton
                ticketId={detail.ticketId}
                onRedeemed={onRedeemed}
              />
            )}
          </div>
        ))}
      </div>
    );
  }
);

/** The L1 transaction that created a ticket; a chain without an explorer gets the bare hash */
function CreationTxLink({ hash, chain }: { hash: string; chain: Chain }) {
  const short = `${hash.slice(0, 10)}...${hash.slice(-8)}`;
  return (
    <span
      className="flex items-center gap-1 text-muted-foreground"
      data-testid="retryable-creation-tx"
    >
      created{" "}
      {chain === "unknown" ? (
        <span className="font-mono" title={hash}>
          {short}
        </span>
      ) : (
        <a
          href={getStageTxExplorerUrl(hash, chain)}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
        >
          {short}
          <ExternalLinkIcon className="h-3 w-3" />
        </a>
      )}
    </span>
  );
}
