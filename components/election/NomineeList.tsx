"use client";

import { useEffect, useState } from "react";

import {
  CheckCircle2,
  ExternalLink,
  Globe,
  MapPin,
  Shield,
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
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/HoverCard";
import { Skeleton } from "@/components/ui/Skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import type { CandidateProfile } from "@/lib/candidate-profiles";
import {
  getCandidateDisplayName,
  getCandidateProfile,
} from "@/lib/candidate-profiles";
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

// ---------------------------------------------------------------------------
// Shared: candidate identity display (avatar + name + links)
// ---------------------------------------------------------------------------

function CandidateIdentity({
  address,
  electionIndex,
  round,
  className,
}: {
  address: string;
  electionIndex?: number;
  round?: 1 | 2;
  className?: string;
}) {
  const profile = getCandidateProfile(address);
  const displayName = getCandidateDisplayName(address);
  const explorerUrl = getAddressExplorerUrl(address);
  const tallyUrl =
    electionIndex !== undefined && round !== undefined
      ? getTallyProfileUrl(electionIndex, address, round)
      : null;

  const trigger = (
    <div className={cn("flex items-center gap-2 min-w-0", className)}>
      {profile?.picture ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={profile.picture}
          alt=""
          className="h-7 w-7 rounded-full object-cover shrink-0 border border-border/50"
        />
      ) : (
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted shrink-0">
          <User className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
      )}
      <div className="flex items-center gap-1.5 min-w-0">
        {displayName ? (
          <span className="text-sm font-medium truncate">{displayName}</span>
        ) : (
          <span className="font-mono text-xs truncate">{address}</span>
        )}
        <div className="flex items-center gap-1 shrink-0">
          {tallyUrl && (
            <a
              href={tallyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-primary transition-colors"
              title="View on Tally"
              onClick={(e) => e.stopPropagation()}
            >
              <Globe className="h-3 w-3" />
            </a>
          )}
          <a
            href={explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-primary transition-colors"
            title="View on Arbiscan"
            onClick={(e) => e.stopPropagation()}
          >
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>
    </div>
  );

  if (!profile || (!profile.motivation && !profile.qualifications)) {
    return trigger;
  }

  return (
    <HoverCard openDelay={300} closeDelay={100}>
      <HoverCardTrigger asChild>{trigger}</HoverCardTrigger>
      <CandidateHoverContent profile={profile} />
    </HoverCard>
  );
}

// ---------------------------------------------------------------------------
// HoverCard content: shows profile details on hover
// ---------------------------------------------------------------------------

function CandidateHoverContent({ profile }: { profile: CandidateProfile }) {
  return (
    <HoverCardContent
      className="w-80 max-h-[400px] overflow-y-auto"
      side="right"
      align="start"
    >
      <div className="space-y-3">
        {/* Header */}
        <div className="flex items-start gap-3">
          {profile.picture ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={profile.picture}
              alt=""
              className="h-10 w-10 rounded-full object-cover shrink-0 border border-border/50"
            />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted shrink-0">
              <User className="h-5 w-5 text-muted-foreground" />
            </div>
          )}
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">
              {profile.name ?? profile.address}
            </p>
            <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
              {profile.country && (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <MapPin className="h-3 w-3" />
                  {profile.country}
                </span>
              )}
              {profile.entityType && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                  {profile.entityType.length > 20
                    ? profile.entityType.split(/[:.]/)[0].trim()
                    : profile.entityType}
                </Badge>
              )}
            </div>
          </div>
        </div>

        {/* Motivation */}
        {profile.motivation && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">
              Motivation
            </p>
            <p className="text-xs leading-relaxed line-clamp-4">
              {profile.motivation}
            </p>
          </div>
        )}

        {/* Qualifications */}
        {profile.qualifications && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">
              Experience
            </p>
            <p className="text-xs leading-relaxed line-clamp-4">
              {profile.qualifications}
            </p>
          </div>
        )}

        {/* Technical skills */}
        {profile.technicalSkills && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">
              Technical Skills
            </p>
            <div className="flex flex-wrap gap-1.5">
              <SkillBadge
                label="Sol"
                value={profile.technicalSkills.solidity}
              />
              <SkillBadge
                label="JS"
                value={profile.technicalSkills.javascript}
              />
              <SkillBadge label="Rust" value={profile.technicalSkills.rust} />
              <SkillBadge label="Go" value={profile.technicalSkills.golang} />
              {profile.technicalSkills.cybersecurityYears != null && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                  <Shield className="h-2.5 w-2.5 mr-0.5" />
                  {profile.technicalSkills.cybersecurityYears}yr
                </Badge>
              )}
            </div>
          </div>
        )}

        {/* Projects */}
        {profile.projectsInvolved && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">
              Projects
            </p>
            <p className="text-xs leading-relaxed line-clamp-2">
              {profile.projectsInvolved}
            </p>
          </div>
        )}

        {/* View full profile link */}
        <a
          href={profile.tallyProfileUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="block text-xs text-primary hover:underline"
        >
          View full profile on Tally
        </a>
      </div>
    </HoverCardContent>
  );
}

function SkillBadge({ label, value }: { label: string; value: number | null }) {
  if (value == null) return null;
  return (
    <Badge
      variant="outline"
      className={cn(
        "text-[10px] px-1.5 py-0",
        value >= 8 && "border-green-500/50 text-green-400",
        value >= 5 && value < 8 && "border-yellow-500/50 text-yellow-400",
        value < 5 && "border-muted-foreground/50"
      )}
    >
      {label}: {value}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Main NomineeList
// ---------------------------------------------------------------------------

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
            {showContenders
              ? "Registered Contenders"
              : showResults
                ? "Election Results"
                : "Nominees"}
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
        <CardDescription>
          {showContenders
            ? `${nomineeDetails.contenders.length} contender${nomineeDetails.contenders.length !== 1 ? "s" : ""} registered`
            : showResults
              ? `Top 6 nominees will be elected to the Security Council`
              : `${nomineeDetails.compliantNominees.length} compliant nominees of ${nomineeDetails.targetNomineeCount} required`}
        </CardDescription>
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
            electionIndex={electionIndex}
          />
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Nominee Election List
// ---------------------------------------------------------------------------

function NomineeElectionList({
  details,
  electionIndex,
}: {
  details: NomineeElectionDetails;
  electionIndex?: number;
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

// ---------------------------------------------------------------------------
// Member Election Results
// ---------------------------------------------------------------------------

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
              <CandidateIdentity
                address={nominee.address}
                electionIndex={electionIndex}
                round={2}
              />
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
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Nominee Row
// ---------------------------------------------------------------------------

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
        <CandidateIdentity
          address={address}
          electionIndex={electionIndex}
          round={round}
        />
      </div>
      <span className="text-sm text-muted-foreground shrink-0 ml-2">
        {votes} ARB
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Contender List
// ---------------------------------------------------------------------------

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
      {contenders.map((contender, index) => (
        <div
          key={contender.address}
          className="flex items-center justify-between rounded-lg border border-border/50 bg-muted/30 p-3"
        >
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground shrink-0">
              {index + 1}
            </span>
            <CandidateIdentity
              address={contender.address}
              electionIndex={electionIndex}
              round={1}
            />
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
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function NomineeListSkeleton(): React.ReactElement {
  return (
    <Card variant="glass">
      <CardHeader>
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-4 w-48 mt-2" />
      </CardHeader>
      <CardContent className="space-y-2">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </CardContent>
    </Card>
  );
}
