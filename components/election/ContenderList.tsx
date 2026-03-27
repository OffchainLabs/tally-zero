import type {
  SerializableContender,
  SerializableNominee,
} from "@gzeoneth/gov-tracker";
import { ExternalLink } from "lucide-react";
import Link from "next/link";

import { getDelegateLabel } from "@/lib/delegate-cache";
import { getCandidateName, getCandidateProfileUrl } from "@/lib/election-utils";
import { getAddressExplorerUrl } from "@/lib/explorer-utils";

import { ContenderQuorumBar } from "./ContenderQuorumBar";

interface ContenderListProps {
  contenders: SerializableContender[];
  electionIndex?: number;
  nominees?: SerializableNominee[];
  quorumThreshold?: string;
}

export function ContenderList({
  contenders,
  electionIndex,
  nominees,
  quorumThreshold,
}: ContenderListProps): React.ReactElement {
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
        const candidateName = getCandidateName(contender.address);
        const label = candidateName ?? getDelegateLabel(contender.address);
        const profileUrl = getCandidateProfileUrl(contender.address);
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
                <div className="flex items-center gap-2 min-w-0">
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
                  <div className="flex items-center gap-1 shrink-0">
                    <a
                      href={explorerUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted-foreground hover:text-primary transition-colors"
                      title="View on Arbiscan"
                    >
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </div>
              </div>
              {!nominees && (
                <a
                  href={`https://arbiscan.io/tx/${contender.registrationTxHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-muted-foreground hover:text-primary transition-colors shrink-0 ml-2"
                  title="Registration transaction"
                >
                  Registered
                </a>
              )}
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
