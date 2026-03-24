import type { SerializableMemberDetails } from "@gzeoneth/gov-tracker";
import { ExternalLink, User } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { getDelegateLabel } from "@/lib/delegate-cache";
import { getTallyProfileUrl } from "@/lib/election-utils";
import { getAddressExplorerUrl } from "@/lib/explorer-utils";
import { formatVotingPower } from "@/lib/format-utils";
import { cn } from "@/lib/utils";

interface MemberElectionResultsProps {
  details: SerializableMemberDetails;
  electionIndex?: number;
}

export function MemberElectionResults({
  details,
  electionIndex,
}: MemberElectionResultsProps): React.ReactElement {
  return (
    <div className="space-y-4">
      <div className="grid gap-2 text-sm">
        <div className="flex justify-between text-muted-foreground">
          <span>Winners</span>
          <span>{details.winners.length} / 6</span>
        </div>
      </div>

      <div className="space-y-2">
        {details.nominees.map((nominee, index: number) => {
          const label = getDelegateLabel(nominee.address);
          const explorerUrl = getAddressExplorerUrl(nominee.address);
          const tallyUrl =
            electionIndex !== undefined
              ? getTallyProfileUrl(electionIndex, nominee.address, 2)
              : null;

          return (
            <div
              key={nominee.address}
              className={cn(
                "flex items-center justify-between rounded-lg border p-3",
                nominee.isWinner
                  ? "border-green-500/30 bg-green-500/10"
                  : "border-border/50 bg-muted/30"
              )}
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <span
                  className={cn(
                    "flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold shrink-0",
                    nominee.isWinner
                      ? "bg-green-500 text-white"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {index + 1}
                </span>
                <div className="flex items-center gap-2 min-w-0">
                  {label ? (
                    <span className="text-sm font-medium truncate">
                      {label}
                    </span>
                  ) : (
                    <span className="font-mono text-xs break-all">
                      {nominee.address}
                    </span>
                  )}
                  <div className="flex items-center gap-1 shrink-0">
                    {tallyUrl && (
                      <a
                        href={tallyUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-muted-foreground hover:text-primary transition-colors"
                        title="View on Tally"
                      >
                        <User className="h-3 w-3" />
                      </a>
                    )}
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
              <div className="flex items-center gap-2 shrink-0 ml-2">
                <span className="text-sm text-muted-foreground">
                  {formatVotingPower(nominee.weightReceived.toString())} ARB
                </span>
                {nominee.isWinner && (
                  <Badge variant="default" className="bg-green-500">
                    Winner
                  </Badge>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
