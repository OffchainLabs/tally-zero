import type {
  SerializableMemberDetails,
  SerializableNominee,
  SerializableNomineeDetails,
} from "@gzeoneth/gov-tracker";
import { AlertCircle, Clock, ShieldX, XCircle } from "lucide-react";
import Link from "next/link";

import { getDelegateLabel } from "@/lib/delegate-cache";
import { getCandidateName, getCandidateTitle } from "@/lib/election-utils";
import { formatVotingPower } from "@/lib/format-utils";
import { cn } from "@/lib/utils";
import type { ElectionPhase, NomineeSortOrder } from "@/types/election";

interface NomineeElectionListProps {
  details: SerializableNomineeDetails;
  memberDetails?: SerializableMemberDetails | null;
  electionIndex?: number;
  phase?: ElectionPhase;
  sortOrder?: NomineeSortOrder;
  randomSeed?: number;
}

function sortNominees(
  nominees: SerializableNominee[],
  sortOrder: NomineeSortOrder,
  randomSeed: number,
  memberDataMap?: Map<string, { weight: string; rank: number }>
): SerializableNominee[] {
  const sorted = [...nominees];
  switch (sortOrder) {
    case "alphabetical":
      sorted.sort((a, b) => {
        const nameA = (
          getCandidateName(a.address) ??
          getDelegateLabel(a.address) ??
          a.address
        ).toLowerCase();
        const nameB = (
          getCandidateName(b.address) ??
          getDelegateLabel(b.address) ??
          b.address
        ).toLowerCase();
        return nameA.localeCompare(nameB);
      });
      break;
    case "votes": {
      sorted.sort((a, b) => {
        const voteA = BigInt(
          memberDataMap?.get(a.address.toLowerCase())?.weight ??
            a.votesReceived.toString()
        );
        const voteB = BigInt(
          memberDataMap?.get(b.address.toLowerCase())?.weight ??
            b.votesReceived.toString()
        );
        if (voteB > voteA) return 1;
        if (voteB < voteA) return -1;
        return 0;
      });
      break;
    }
    case "random": {
      const seededRandom = (seed: number) => {
        const x = Math.sin(seed) * 10000;
        return x - Math.floor(x);
      };
      for (let i = sorted.length - 1; i > 0; i--) {
        const j = Math.floor(seededRandom(randomSeed * 1000 + i) * (i + 1));
        [sorted[i], sorted[j]] = [sorted[j], sorted[i]];
      }
      break;
    }
  }
  return sorted;
}

export function NomineeElectionList({
  details,
  memberDetails,
  electionIndex,
  phase,
  sortOrder = "votes",
  randomSeed = 0,
}: NomineeElectionListProps): React.ReactElement {
  const { compliantNominees, excludedNominees, quorumThreshold } = details;
  const threshold = formatVotingPower(quorumThreshold.toString());
  const isVetting = phase === "VETTING_PERIOD";
  const isMemberElection =
    phase === "MEMBER_ELECTION" ||
    phase === "PENDING_EXECUTION" ||
    phase === "COMPLETED";

  // During member election and beyond, cross-reference with memberDetails
  // to separate eligible nominees from those excluded during compliance review.
  let eligibleNominees: SerializableNominee[];
  let nonCompliantNominees: SerializableNominee[];
  if (isMemberElection && memberDetails) {
    const memberAddresses = new Set(
      memberDetails.nominees.map((n) => n.address.toLowerCase())
    );
    eligibleNominees = compliantNominees.filter((n) =>
      memberAddresses.has(n.address.toLowerCase())
    );
    nonCompliantNominees = compliantNominees.filter(
      (n) => !memberAddresses.has(n.address.toLowerCase())
    );
  } else {
    eligibleNominees = compliantNominees;
    nonCompliantNominees = [];
  }

  // Build a lookup for member election data (weight + rank) by address
  const memberDataMap = new Map<string, { weight: string; rank: number }>();
  if (isMemberElection && memberDetails) {
    for (const n of memberDetails.nominees) {
      memberDataMap.set(n.address.toLowerCase(), {
        weight: n.weightReceived,
        rank: n.rank,
      });
    }
  }

  eligibleNominees = sortNominees(
    eligibleNominees,
    sortOrder,
    randomSeed,
    memberDataMap
  );
  nonCompliantNominees = sortNominees(
    nonCompliantNominees,
    sortOrder,
    randomSeed,
    memberDataMap
  );
  const sortedExcludedNominees = sortNominees(
    excludedNominees,
    sortOrder,
    randomSeed
  );

  const allSameVotes =
    !isMemberElection &&
    eligibleNominees.length > 1 &&
    eligibleNominees.every(
      (n) => n.votesReceived === eligibleNominees[0].votesReceived
    );

  return (
    <div className="space-y-4">
      {!isMemberElection && (
        <div className="text-sm text-muted-foreground">
          Quorum threshold: {threshold} ARB
        </div>
      )}

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

      {!isVetting && eligibleNominees.length < details.targetNomineeCount && (
        <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3">
          <div className="flex items-start gap-2 text-yellow-500">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <div className="text-sm">
              <p className="font-medium">
                {eligibleNominees.length} of {details.targetNomineeCount}{" "}
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

      {eligibleNominees.length > 0 && (
        <div className="space-y-2">
          <h4
            className={cn(
              "text-sm font-medium",
              isVetting ? "text-yellow-500" : "text-green-500"
            )}
          >
            {isVetting
              ? `Undergoing Review (${eligibleNominees.length})`
              : isMemberElection
                ? `Eligible Nominees (${eligibleNominees.length})`
                : `Compliant Nominees (${eligibleNominees.length})`}
          </h4>
          <div className="space-y-2">
            {eligibleNominees.map((nominee) => {
              const memberData = memberDataMap.get(
                nominee.address.toLowerCase()
              );
              return (
                <NomineeRow
                  key={nominee.address}
                  address={nominee.address}
                  votes={
                    isMemberElection && memberData
                      ? `${formatVotingPower(memberData.weight)} weighted votes`
                      : allSameVotes
                        ? ""
                        : `${formatVotingPower(nominee.votesReceived.toString())} ARB`
                  }
                  rank={memberData?.rank}
                  electionIndex={electionIndex}
                  round={1}
                  isCompliant={!isVetting}
                  isPendingReview={isVetting}
                  showVoteLink={phase === "MEMBER_ELECTION"}
                  phase={phase}
                />
              );
            })}
          </div>
        </div>
      )}

      {nonCompliantNominees.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-orange-500">
            Non-Compliant ({nonCompliantNominees.length})
          </h4>
          <div className="space-y-2">
            {nonCompliantNominees.map((nominee) => (
              <NomineeRow
                key={nominee.address}
                address={nominee.address}
                votes={`${formatVotingPower(nominee.votesReceived.toString())} ARB`}
                electionIndex={electionIndex}
                round={1}
                isNonCompliant
              />
            ))}
          </div>
        </div>
      )}

      {sortedExcludedNominees.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-red-500">
            Excluded Nominees ({sortedExcludedNominees.length})
          </h4>
          <div className="space-y-2">
            {sortedExcludedNominees.map((nominee) => (
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

      {eligibleNominees.length === 0 && sortedExcludedNominees.length === 0 && (
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
  rank,
  electionIndex,
  round,
  isCompliant,
  isExcluded,
  isNonCompliant,
  isPendingReview,
  showVoteLink,
  phase,
}: {
  address: string;
  votes: string;
  rank?: number;
  electionIndex?: number;
  round?: 1 | 2;
  isCompliant?: boolean;
  isExcluded?: boolean;
  isNonCompliant?: boolean;
  isPendingReview?: boolean;
  showVoteLink?: boolean;
  phase?: ElectionPhase;
}): React.ReactElement {
  const label = getCandidateName(address) ?? getDelegateLabel(address);
  const title = isPendingReview ? getCandidateTitle(address) : undefined;

  return (
    <div
      className={cn(
        "flex items-center justify-between rounded-lg border p-3",
        isCompliant && "border-green-500/30 bg-green-500/10",
        isExcluded && "border-red-500/30 bg-red-500/10",
        isNonCompliant && "border-orange-500/30 bg-orange-500/10",
        isPendingReview && "border-yellow-500/30 bg-yellow-500/10"
      )}
    >
      <div className="flex items-center gap-2 min-w-0 flex-1">
        {rank !== undefined && (
          <span
            className={cn(
              "text-xs font-bold shrink-0 w-6 text-center",
              rank <= 6 && phase === "PENDING_EXECUTION"
                ? "text-green-500"
                : "text-muted-foreground"
            )}
          >
            #{rank}
          </span>
        )}
        {isPendingReview && (
          <Clock className="h-4 w-4 text-yellow-500 shrink-0" />
        )}
        {isExcluded && <XCircle className="h-4 w-4 text-red-500 shrink-0" />}
        {isNonCompliant && (
          <ShieldX className="h-4 w-4 text-orange-500 shrink-0" />
        )}
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <Link
              href={`/elections/contender/${address.toLowerCase()}`}
              className="text-sm font-medium truncate text-primary underline underline-offset-2 decoration-primary/30 hover:decoration-primary transition-colors"
            >
              {label ?? address}
            </Link>
            {title && (
              <span className="text-xs text-muted-foreground truncate">
                {title}
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0 ml-2">
        <span className="text-sm text-muted-foreground">{votes}</span>
        {showVoteLink && (
          <Link
            href={`/elections/contender/${address.toLowerCase()}`}
            className="text-xs font-medium text-primary hover:text-primary/80 transition-colors"
          >
            Vote &rarr;
          </Link>
        )}
      </div>
    </div>
  );
}
