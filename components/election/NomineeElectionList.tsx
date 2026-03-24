import type { SerializableNomineeDetails } from "@gzeoneth/gov-tracker";
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  User,
  XCircle,
} from "lucide-react";

import { getDelegateLabel } from "@/lib/delegate-cache";
import { getTallyProfileUrl } from "@/lib/election-utils";
import { getAddressExplorerUrl } from "@/lib/explorer-utils";
import { formatVotingPower } from "@/lib/format-utils";
import { cn } from "@/lib/utils";

interface NomineeElectionListProps {
  details: SerializableNomineeDetails;
  electionIndex?: number;
}

export function NomineeElectionList({
  details,
  electionIndex,
}: NomineeElectionListProps): React.ReactElement {
  const { compliantNominees, excludedNominees, quorumThreshold } = details;
  const threshold = formatVotingPower(quorumThreshold.toString());

  return (
    <div className="space-y-4">
      <div className="text-sm text-muted-foreground">
        Quorum threshold: {threshold} ARB
      </div>

      {compliantNominees.length < details.targetNomineeCount && (
        <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3">
          <div className="flex items-start gap-2 text-yellow-500">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <div className="text-sm">
              <p className="font-medium">
                {compliantNominees.length} of {details.targetNomineeCount}{" "}
                nominees qualified
              </p>
              <p className="text-yellow-500/80 mt-1">
                Per the ArbitrumDAO Constitution, if fewer than{" "}
                {details.targetNomineeCount} contenders reach the quorum
                threshold, current Security Council members whose seats are up
                for election may be randomly selected as candidates to fill the
                remaining seats.
              </p>
            </div>
          </div>
        </div>
      )}

      {compliantNominees.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-green-500">
            Compliant Nominees ({compliantNominees.length})
          </h4>
          <div className="space-y-2">
            {compliantNominees.map((nominee) => (
              <NomineeRow
                key={nominee.address}
                address={nominee.address}
                votes={formatVotingPower(nominee.votesReceived.toString())}
                electionIndex={electionIndex}
                round={1}
                isCompliant
              />
            ))}
          </div>
        </div>
      )}

      {excludedNominees.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-red-500">
            Excluded Nominees ({excludedNominees.length})
          </h4>
          <div className="space-y-2">
            {excludedNominees.map((nominee) => (
              <NomineeRow
                key={nominee.address}
                address={nominee.address}
                votes={formatVotingPower(nominee.votesReceived.toString())}
                electionIndex={electionIndex}
                round={1}
                isExcluded
              />
            ))}
          </div>
        </div>
      )}

      {compliantNominees.length === 0 && excludedNominees.length === 0 && (
        <div className="text-center text-muted-foreground py-8">
          No nominees yet
        </div>
      )}
    </div>
  );
}

function NomineeRow({
  address,
  votes,
  electionIndex,
  round,
  isCompliant,
  isExcluded,
}: {
  address: string;
  votes: string;
  electionIndex?: number;
  round?: 1 | 2;
  isCompliant?: boolean;
  isExcluded?: boolean;
}): React.ReactElement {
  const label = getDelegateLabel(address);
  const explorerUrl = getAddressExplorerUrl(address);
  const tallyUrl =
    electionIndex !== undefined && round !== undefined
      ? getTallyProfileUrl(electionIndex, address, round)
      : null;

  return (
    <div
      className={cn(
        "flex items-center justify-between rounded-lg border p-3",
        isCompliant && "border-green-500/30 bg-green-500/10",
        isExcluded && "border-red-500/30 bg-red-500/10"
      )}
    >
      <div className="flex items-center gap-2 min-w-0 flex-1">
        {isCompliant && (
          <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
        )}
        {isExcluded && <XCircle className="h-4 w-4 text-red-500 shrink-0" />}
        <div className="flex items-center gap-2 min-w-0">
          {label ? (
            <span className="text-sm font-medium truncate">{label}</span>
          ) : (
            <span className="font-mono text-xs break-all">{address}</span>
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
      <span className="text-sm text-muted-foreground shrink-0 ml-2">
        {votes} ARB
      </span>
    </div>
  );
}
