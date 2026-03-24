"use client";

import { useEffect, useState } from "react";

import type {
  SerializableMemberDetails,
  SerializableNomineeDetails,
} from "@gzeoneth/gov-tracker";
import { User, Users } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import {
  countQualifiedNominees,
  getContenderDescription,
} from "@/lib/election-utils";
import type { ElectionPhase } from "@/types/election";

import { ContenderList } from "./ContenderList";
import { ContenderVoteList } from "./ContenderVoteList";
import { MemberElectionResults } from "./MemberElectionResults";
import { NomineeElectionList } from "./NomineeElectionList";

type ViewMode = "nominees" | "results";

interface NomineeListProps {
  nomineeDetails: SerializableNomineeDetails | null;
  memberDetails: SerializableMemberDetails | null;
  isLoading: boolean;
  phase: ElectionPhase;
  electionIndex?: number;
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

  const showContenders =
    phase === "CONTENDER_SUBMISSION" ||
    phase === "VETTING_PERIOD" ||
    phase === "NOMINEE_SELECTION";
  const canToggle = hasMemberResults && nomineeDetails;
  const showResults = viewMode === "results" && hasMemberResults;

  let title: string;
  if (showContenders) {
    title = "Contenders";
  } else if (showResults) {
    title = "Election Results";
  } else {
    title = "Nominees";
  }

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
        <CardDescription>
          {showContenders
            ? getContenderDescription(
                nomineeDetails.contenders.length,
                countQualifiedNominees(
                  nomineeDetails.nominees,
                  nomineeDetails.quorumThreshold
                ),
                phase
              )
            : showResults
              ? "Top 6 nominees will be elected to the Security Council"
              : `${nomineeDetails.compliantNominees.length} compliant nominees of ${nomineeDetails.targetNomineeCount} required`}
        </CardDescription>
      </CardHeader>

      <CardContent>
        {phase === "NOMINEE_SELECTION" ? (
          <ContenderVoteList
            contenders={nomineeDetails.contenders}
            nominees={nomineeDetails.nominees}
            quorumThreshold={nomineeDetails.quorumThreshold}
          />
        ) : showContenders ? (
          <ContenderList
            contenders={nomineeDetails.contenders}
            electionIndex={electionIndex}
            nominees={nomineeDetails.nominees}
            quorumThreshold={nomineeDetails.quorumThreshold}
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
