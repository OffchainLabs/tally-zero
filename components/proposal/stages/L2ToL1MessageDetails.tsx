"use client";

import { memo } from "react";

import { formatEtaTimestamp } from "@/lib/date-utils";
import { shortenAddress } from "@/lib/format-utils";
import type { IndexerL2ToL1Message } from "@/lib/tally-data/types";

export interface L2ToL1MessageDetailsProps {
  messages: IndexerL2ToL1Message[];
}

/**
 * The outbox messages an L2 timelock execution sent: where each lands on L1
 * and its outbox position, which `Outbox.executeTransaction` needs.
 */
export const L2ToL1MessageDetails = memo(function L2ToL1MessageDetails({
  messages,
}: L2ToL1MessageDetailsProps) {
  return (
    <div className="space-y-1 mt-1" data-testid="l2-to-l1-messages">
      <p className="text-muted-foreground">
        L2 to L1 messages: {messages.length}
      </p>
      {messages.map((message) => (
        <div
          key={message.position}
          className="flex flex-wrap items-center gap-x-2 text-muted-foreground"
          data-position={message.position}
        >
          <span className="font-mono">#{message.position}</span>
          <span>
            to{" "}
            <span className="font-mono" title={message.destination}>
              {shortenAddress(message.destination)}
            </span>
          </span>
          <span>L1 block {message.ethBlockNum}</span>
          {message.timestamp !== "0" && (
            <span>sent {formatEtaTimestamp(message.timestamp)}</span>
          )}
        </div>
      ))}
    </div>
  );
});
