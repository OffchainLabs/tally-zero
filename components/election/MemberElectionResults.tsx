import type { SerializableMemberDetails } from "@gzeoneth/gov-tracker";
import Link from "next/link";

import { Badge } from "@/components/ui/Badge";
import { getDelegateLabel } from "@/lib/delegate-cache";
import { getCandidateName } from "@/lib/election-utils";
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
          const label =
            getCandidateName(nominee.address) ??
            getDelegateLabel(nominee.address);
          const explorerUrl = getAddressExplorerUrl(nominee.address);

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
                  <Link
                    href={`/elections/contender/${nominee.address.toLowerCase()}`}
                    className="text-sm font-medium truncate text-primary underline underline-offset-2 decoration-primary/30 hover:decoration-primary transition-colors"
                  >
                    {label ?? nominee.address}
                  </Link>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-2">
                <span className="text-sm text-muted-foreground">
                  {formatVotingPower(nominee.weightReceived.toString())}{" "}
                  weighted votes
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
