import type { SerializableNomineeDetails } from "@gzeoneth/gov-tracker";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  ExternalLink,
  User,
  XCircle,
} from "lucide-react";

import { getDelegateLabel } from "@/lib/delegate-cache";
import { getTallyProfileUrl } from "@/lib/election-utils";
import { getAddressExplorerUrl } from "@/lib/explorer-utils";
import { formatVotingPower } from "@/lib/format-utils";
import { cn } from "@/lib/utils";
import type { ElectionPhase } from "@/types/election";

interface NomineeElectionListProps {
  details: SerializableNomineeDetails;
  electionIndex?: number;
  phase?: ElectionPhase;
}

export function NomineeElectionList({
  details,
  electionIndex,
  phase,
}: NomineeElectionListProps): React.ReactElement {
  const { compliantNominees, excludedNominees, quorumThreshold } = details;
  const threshold = formatVotingPower(quorumThreshold.toString());
  const isVetting = phase === "VETTING_PERIOD";
  const allSameVotes =
    compliantNominees.length > 1 &&
    compliantNominees.every(
      (n) => n.votesReceived === compliantNominees[0].votesReceived
    );

  return (
    <div className="space-y-4">
      <div className="text-sm text-muted-foreground">
        Quorum threshold: {threshold} ARB
      </div>

      {isVetting && (
        <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3">
          <div className="flex items-start gap-2 text-yellow-500">
            <Clock className="h-4 w-4 mt-0.5 shrink-0" />
            <div className="text-sm">
              <p className="font-medium">Compliance check in progress</p>
              <p className="text-yellow-500/80 mt-1">
                The Arbitrum Foundation is vetting nominees for compliance with
                legal requirements. Non-compliant nominees will be excluded
                before the member election begins.
              </p>
            </div>
          </div>
        </div>
      )}

      {!isVetting && compliantNominees.length < details.targetNomineeCount && (
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
          <h4
            className={cn(
              "text-sm font-medium",
              isVetting ? "text-yellow-500" : "text-green-500"
            )}
          >
            {isVetting
              ? `Pending Review (${compliantNominees.length})`
              : `Compliant Nominees (${compliantNominees.length})`}
          </h4>
          <div className="space-y-2">
            {compliantNominees.map((nominee) => (
              <NomineeRow
                key={nominee.address}
                address={nominee.address}
                votes={
                  allSameVotes
                    ? "Reached quorum"
                    : `${formatVotingPower(nominee.votesReceived.toString())} ARB`
                }
                electionIndex={electionIndex}
                round={1}
                isCompliant={!isVetting}
                isPendingReview={isVetting}
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
                votes={`${formatVotingPower(nominee.votesReceived.toString())} ARB`}
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
  isPendingReview,
}: {
  address: string;
  votes: string;
  electionIndex?: number;
  round?: 1 | 2;
  isCompliant?: boolean;
  isExcluded?: boolean;
  isPendingReview?: boolean;
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
        isExcluded && "border-red-500/30 bg-red-500/10",
        isPendingReview && "border-yellow-500/30 bg-yellow-500/10"
      )}
    >
      <div className="flex items-center gap-2 min-w-0 flex-1">
        {isCompliant && (
          <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
        )}
        {isPendingReview && (
          <Clock className="h-4 w-4 text-yellow-500 shrink-0" />
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
        {votes}
      </span>
    </div>
  );
}
