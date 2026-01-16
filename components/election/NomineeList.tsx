"use client";

import { CheckCircle2, User, XCircle } from "lucide-react";

import type { ProposalStageTracker } from "@gzeoneth/gov-tracker";

import { Badge } from "@/components/ui/Badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { formatVotingPower, shortenAddress } from "@/lib/format-utils";
import { cn } from "@/lib/utils";
import type { ElectionPhase } from "@/types/election";

type ElectionCheckpoint = NonNullable<
  Awaited<ReturnType<ProposalStageTracker["getElectionCheckpoint"]>>
>;
type NomineeDetails = ElectionCheckpoint["nomineeDetails"];
type MemberDetails = ElectionCheckpoint["memberDetails"];
type NomineeElectionDetails = NonNullable<NomineeDetails>;
type MemberElectionDetails = NonNullable<MemberDetails>;

interface NomineeListProps {
  nomineeDetails: NomineeDetails;
  memberDetails: MemberDetails;
  isLoading: boolean;
  phase: ElectionPhase;
}

export function NomineeList({
  nomineeDetails,
  memberDetails,
  isLoading,
  phase,
}: NomineeListProps): React.ReactElement | null {
  if (isLoading && !nomineeDetails) {
    return <NomineeListSkeleton />;
  }

  if (!nomineeDetails) {
    return null;
  }

  const showMemberResults =
    memberDetails &&
    (phase === "MEMBER_ELECTION" ||
      phase === "PENDING_EXECUTION" ||
      phase === "COMPLETED");

  return (
    <Card variant="glass">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <User className="h-5 w-5" />
          {showMemberResults ? "Election Results" : "Nominees"}
        </CardTitle>
        <CardDescription>
          {showMemberResults
            ? `Top 6 nominees will be elected to the Security Council`
            : `${nomineeDetails.compliantNominees.length} compliant nominees of ${nomineeDetails.targetNomineeCount} required`}
        </CardDescription>
      </CardHeader>

      <CardContent>
        {showMemberResults && memberDetails ? (
          <MemberElectionResults details={memberDetails} />
        ) : (
          <NomineeElectionList details={nomineeDetails} />
        )}
      </CardContent>
    </Card>
  );
}

function NomineeElectionList({
  details,
}: {
  details: NomineeElectionDetails;
}): React.ReactElement {
  const { compliantNominees, excludedNominees, quorumThreshold } = details;
  const threshold = formatVotingPower(quorumThreshold.toString());

  return (
    <div className="space-y-4">
      <div className="text-sm text-muted-foreground">
        Quorum threshold: {threshold} ARB
      </div>

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

function MemberElectionResults({
  details,
}: {
  details: MemberElectionDetails;
}): React.ReactElement {
  return (
    <div className="space-y-4">
      <div className="grid gap-2 text-sm">
        <div className="flex justify-between text-muted-foreground">
          <span>Winners</span>
          <span>{details.winners.length} / 6</span>
        </div>
      </div>

      <div className="space-y-2">
        {details.nominees.map((nominee, index: number) => (
          <div
            key={nominee.address}
            className={cn(
              "flex items-center justify-between rounded-lg border p-3",
              nominee.isWinner
                ? "border-green-500/30 bg-green-500/10"
                : "border-border/50 bg-muted/30"
            )}
          >
            <div className="flex items-center gap-3">
              <span
                className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold",
                  nominee.isWinner
                    ? "bg-green-500 text-white"
                    : "bg-muted text-muted-foreground"
                )}
              >
                {index + 1}
              </span>
              <span className="font-mono text-sm">
                {shortenAddress(nominee.address)}
              </span>
            </div>
            <div className="flex items-center gap-2">
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
        ))}
      </div>
    </div>
  );
}

function NomineeRow({
  address,
  votes,
  isCompliant,
  isExcluded,
}: {
  address: string;
  votes: string;
  isCompliant?: boolean;
  isExcluded?: boolean;
}): React.ReactElement {
  return (
    <div
      className={cn(
        "flex items-center justify-between rounded-lg border p-3",
        isCompliant && "border-green-500/30 bg-green-500/10",
        isExcluded && "border-red-500/30 bg-red-500/10"
      )}
    >
      <div className="flex items-center gap-2">
        {isCompliant && <CheckCircle2 className="h-4 w-4 text-green-500" />}
        {isExcluded && <XCircle className="h-4 w-4 text-red-500" />}
        <span className="font-mono text-sm">{shortenAddress(address)}</span>
      </div>
      <span className="text-sm text-muted-foreground">{votes} ARB</span>
    </div>
  );
}

function NomineeListSkeleton(): React.ReactElement {
  return (
    <Card variant="glass">
      <CardHeader>
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-4 w-48 mt-2" />
      </CardHeader>
      <CardContent className="space-y-2">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </CardContent>
    </Card>
  );
}
