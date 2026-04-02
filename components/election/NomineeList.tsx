"use client";

import { useState } from "react";

import type {
  SerializableMemberDetails,
  SerializableNomineeDetails,
} from "@gzeoneth/gov-tracker";
import { ArrowDownUp, User, Users } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  countQualifiedNominees,
  getContenderDescription,
} from "@/lib/election-utils";
import type { ElectionPhase, NomineeSortOrder } from "@/types/election";

import { ContenderList } from "./ContenderList";
import { ContenderVoteList } from "./ContenderVoteList";
import { MemberElectionResults } from "./MemberElectionResults";
import { NomineeElectionList } from "./NomineeElectionList";

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
    memberDetails && (phase === "PENDING_EXECUTION" || phase === "COMPLETED");

  const defaultSort: NomineeSortOrder =
    phase === "PENDING_EXECUTION" ? "votes" : "random";
  const [sortOrder, setSortOrder] = useState<NomineeSortOrder>(defaultSort);

  const effectiveSort =
    phase === "VETTING_PERIOD" && sortOrder === "votes" ? "random" : sortOrder;

  if (isLoading && !nomineeDetails) {
    return <NomineeListSkeleton />;
  }

  if (!nomineeDetails) {
    return null;
  }

  const showContenders =
    phase === "CONTENDER_SUBMISSION" || phase === "NOMINEE_SELECTION";
  const showResults = !!hasMemberResults;
  const showNomineeList = !showContenders && !showResults;
  const showSortDropdown = showNomineeList || phase === "NOMINEE_SELECTION";

  let title: string;
  if (showContenders) {
    title = "Contenders";
  } else if (showResults) {
    title = "Election Results";
  } else if (phase === "VETTING_PERIOD") {
    title = "Compliance Check";
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
          <div className="flex items-center gap-2">
            {showSortDropdown && (
              <Select
                value={sortOrder}
                onValueChange={(v) => setSortOrder(v as NomineeSortOrder)}
              >
                <SelectTrigger className="w-[160px] h-8 text-xs">
                  <ArrowDownUp className="h-3 w-3 mr-1 shrink-0" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="random">Random</SelectItem>
                  <SelectItem value="alphabetical">Alphabetical</SelectItem>
                  {phase !== "VETTING_PERIOD" && (
                    <SelectItem value="votes">Most Votes</SelectItem>
                  )}
                </SelectContent>
              </Select>
            )}
          </div>
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
              : phase === "VETTING_PERIOD"
                ? `${nomineeDetails.compliantNominees.length} nominees pending compliance review`
                : null}
        </CardDescription>
      </CardHeader>

      <CardContent>
        {phase === "CONTENDER_SUBMISSION" ? (
          <ContenderList
            contenders={nomineeDetails.contenders}
            electionIndex={electionIndex}
          />
        ) : phase === "NOMINEE_SELECTION" ? (
          <ContenderVoteList
            contenders={nomineeDetails.contenders}
            nominees={nomineeDetails.nominees}
            quorumThreshold={nomineeDetails.quorumThreshold}
            sortOrder={effectiveSort}
          />
        ) : showResults && memberDetails ? (
          <MemberElectionResults
            details={memberDetails}
            electionIndex={electionIndex}
          />
        ) : (
          <NomineeElectionList
            details={nomineeDetails}
            memberDetails={memberDetails}
            electionIndex={electionIndex}
            phase={phase}
            sortOrder={effectiveSort}
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
