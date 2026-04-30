"use client";

import type {
  SerializableContender,
  SerializableNominee,
} from "@gzeoneth/gov-tracker";
import { ExternalLink } from "lucide-react";
import Link from "next/link";

import { getAddressExplorerUrl } from "@/lib/explorer-utils";
import { useAddressDisplayRecords } from "@/lib/tally-data/client";

import { ContenderQuorumBar } from "./ContenderQuorumBar";

interface ContenderListProps {
  contenders: SerializableContender[];
  electionIndex?: number;
  nominees?: SerializableNominee[];
  quorumThreshold?: string;
}

export function ContenderList({
  contenders,
  nominees,
  quorumThreshold,
}: ContenderListProps): React.ReactElement {
  const displayRecords = useAddressDisplayRecords(
    contenders.map((contender) => contender.address)
  );

  if (contenders.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-8">
        No contenders registered yet
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {contenders.map((contender, index) => {
        const display = displayRecords.get(contender.address.toLowerCase());
        const label = display?.label;
        const title = display?.title;
        const profileUrl = display?.profileUrl;
        const explorerUrl = getAddressExplorerUrl(contender.address);
        const nomineeData = nominees?.find(
          (n) => n.address.toLowerCase() === contender.address.toLowerCase()
        );
        const votes = nomineeData?.votesReceived ?? "0";

        return (
          <div
            key={contender.address}
            className="rounded-lg border border-border/50 bg-muted/30 p-3 space-y-2"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground shrink-0">
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {profileUrl ? (
                      <Link
                        href={profileUrl}
                        className="text-sm font-medium truncate hover:text-primary transition-colors"
                      >
                        {label ?? contender.address}
                      </Link>
                    ) : label ? (
                      <span className="text-sm font-medium truncate">
                        {label}
                      </span>
                    ) : (
                      <span className="font-mono text-xs break-all">
                        {contender.address}
                      </span>
                    )}
                    <a
                      href={explorerUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted-foreground hover:text-primary transition-colors shrink-0"
                      title="View on Arbiscan"
                    >
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                  {title && (
                    <span className="text-xs text-muted-foreground">
                      {title}
                    </span>
                  )}
                </div>
              </div>
            </div>
            {nominees && quorumThreshold && (
              <ContenderQuorumBar
                votes={votes}
                quorumThreshold={quorumThreshold}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
