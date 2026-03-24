"use client";

import { useEffect, useState } from "react";

import {
  CheckCircle2,
  Clock,
  ExternalLink,
  User,
  Users,
  XCircle,
} from "lucide-react";

import type {
  SerializableContender,
  SerializableMemberDetails,
  SerializableNomineeDetails,
} from "@gzeoneth/gov-tracker";

import { Badge } from "@/components/ui/Badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { getDelegateLabel } from "@/lib/delegate-cache";
import { getAddressExplorerUrl } from "@/lib/explorer-utils";
import { formatVotingPower } from "@/lib/format-utils";
import { cn } from "@/lib/utils";
import type { ElectionPhase } from "@/types/election";

type ViewMode = "nominees" | "results";

type NomineeDetails = SerializableNomineeDetails | null;
type MemberDetails = SerializableMemberDetails | null;
type NomineeElectionDetails = SerializableNomineeDetails;
type MemberElectionDetails = SerializableMemberDetails;

interface NomineeListProps {
  nomineeDetails: NomineeDetails;
  memberDetails: MemberDetails;
  isLoading: boolean;
  phase: ElectionPhase;
  electionIndex?: number;
}

function getTallyProfileUrl(
  electionIndex: number,
  address: string,
  round: 1 | 2
): string {
  if (round === 1) {
    return `https://www.tally.xyz/gov/arbitrum/council/security-council/election/${electionIndex}/round-1/candidate/${address}`;
  }
  return `https://www.tally.xyz/gov/arbitrum/council/security-council/election/${electionIndex}/round-2/nominee/${address}`;
}

export function NomineeList({
  nomineeDetails,
  memberDetails,
  isLoading,
  phase,
  electionIndex,
}: NomineeListProps): React.ReactElement | null {
  const hasMemberResults =
    memberDetails &&
    (phase === "MEMBER_ELECTION" ||
      phase === "PENDING_EXECUTION" ||
      phase === "COMPLETED");

  const [viewMode, setViewMode] = useState<ViewMode>("nominees");

  useEffect(() => {
    if (hasMemberResults) {
      setViewMode("results");
    }
  }, [hasMemberResults]);

  if (isLoading && !nomineeDetails) {
    return <NomineeListSkeleton />;
  }

  if (!nomineeDetails) {
    return null;
  }

  const showContenders = phase === "CONTENDER_SUBMISSION";
  const canToggle = hasMemberResults && nomineeDetails;
  const showResults = viewMode === "results" && hasMemberResults;

  const nomineeCount = nomineeDetails.nominees.length;
  const title = showContenders
    ? "Registered Contenders"
    : showResults
      ? "Election Results"
      : "Nominees";
  const description = showContenders
    ? `${nomineeDetails.contenders.length} contender${nomineeDetails.contenders.length !== 1 ? "s" : ""} registered`
    : showResults
      ? `Top 6 nominees will be elected to the Security Council`
      : `${nomineeCount} nominee${nomineeCount !== 1 ? "s" : ""} endorsed`;

  return (
    <Card variant="glass">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            {showResults ? (
              <Users className="h-5 w-5" />
            ) : (
              <User className="h-5 w-5" />
            )}
            {title}
          </CardTitle>
          {canToggle && (
            <Tabs
              value={viewMode}
              onValueChange={(v) => setViewMode(v as ViewMode)}
            >
              <TabsList className="h-8">
                <TabsTrigger value="nominees" className="text-xs px-2 h-6">
                  Nominees
                </TabsTrigger>
                <TabsTrigger value="results" className="text-xs px-2 h-6">
                  Results
                </TabsTrigger>
              </TabsList>
            </Tabs>
          )}
        </div>
        <CardDescription>{description}</CardDescription>
      </CardHeader>

      <CardContent>
        {showContenders ? (
          <ContenderList
            contenders={nomineeDetails.contenders}
            electionIndex={electionIndex}
          />
        ) : showResults && memberDetails ? (
          <MemberElectionResults
            details={memberDetails}
            electionIndex={electionIndex}
          />
        ) : (
          <NomineeElectionList
            details={nomineeDetails}
            phase={phase}
            electionIndex={electionIndex}
          />
        )}
      </CardContent>
    </Card>
  );
}

function getVettingStatus(
  address: string,
  details: NomineeElectionDetails
): "compliant" | "excluded" | "pending" {
  const lower = address.toLowerCase();
  if (details.compliantNominees.some((n) => n.address.toLowerCase() === lower))
    return "compliant";
  if (details.excludedNominees.some((n) => n.address.toLowerCase() === lower))
    return "excluded";
  return "pending";
}

function NomineeElectionList({
  details,
  phase,
  electionIndex,
}: {
  details: NomineeElectionDetails;
  phase: ElectionPhase;
  electionIndex?: number;
}): React.ReactElement {
  const { nominees, quorumThreshold } = details;
  const threshold = formatVotingPower(quorumThreshold.toString());
  const showVettingStatus =
    phase === "VETTING_PERIOD" ||
    phase === "MEMBER_ELECTION" ||
    phase === "PENDING_EXECUTION" ||
    phase === "COMPLETED";

  return (
    <div className="space-y-4">
      <div className="text-sm text-muted-foreground">
        Quorum threshold: {threshold} ARB
      </div>

      {nominees.length > 0 ? (
        <div className="space-y-2">
          {nominees.map((nominee) => {
            const status = showVettingStatus
              ? getVettingStatus(nominee.address, details)
              : undefined;
            return (
              <NomineeRow
                key={nominee.address}
                address={nominee.address}
                votes={formatVotingPower(nominee.votesReceived.toString())}
                electionIndex={electionIndex}
                round={1}
                isCompliant={status === "compliant"}
                isExcluded={status === "excluded"}
                isPendingVetting={status === "pending"}
              />
            );
          })}
        </div>
      ) : (
        <div className="text-center text-muted-foreground py-8">
          No nominees yet
        </div>
      )}
    </div>
  );
}

function MemberElectionResults({
  details,
  electionIndex,
}: {
  details: MemberElectionDetails;
  electionIndex?: number;
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

function NomineeRow({
  address,
  votes,
  electionIndex,
  round,
  isCompliant,
  isExcluded,
  isPendingVetting,
}: {
  address: string;
  votes: string;
  electionIndex?: number;
  round?: 1 | 2;
  isCompliant?: boolean;
  isExcluded?: boolean;
  isPendingVetting?: boolean;
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
        isPendingVetting && "border-yellow-500/30 bg-yellow-500/10"
      )}
    >
      <div className="flex items-center gap-2 min-w-0 flex-1">
        {isCompliant && (
          <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
        )}
        {isExcluded && <XCircle className="h-4 w-4 text-red-500 shrink-0" />}
        {isPendingVetting && (
          <Clock className="h-4 w-4 text-yellow-500 shrink-0" />
        )}
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

function ContenderList({
  contenders,
  electionIndex,
}: {
  contenders: SerializableContender[];
  electionIndex?: number;
}): React.ReactElement {
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
        const label = getDelegateLabel(contender.address);
        const explorerUrl = getAddressExplorerUrl(contender.address);
        const tallyUrl =
          electionIndex !== undefined
            ? getTallyProfileUrl(electionIndex, contender.address, 1)
            : null;

        return (
          <div
            key={contender.address}
            className="flex items-center justify-between rounded-lg border border-border/50 bg-muted/30 p-3"
          >
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground shrink-0">
                {index + 1}
              </span>
              <div className="flex items-center gap-2 min-w-0">
                {label ? (
                  <span className="text-sm font-medium truncate">{label}</span>
                ) : (
                  <span className="font-mono text-xs break-all">
                    {contender.address}
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
            <a
              href={`https://arbiscan.io/tx/${contender.registrationTxHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-muted-foreground hover:text-primary transition-colors shrink-0 ml-2"
              title="Registration transaction"
            >
              Registered
            </a>
          </div>
        );
      })}
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
