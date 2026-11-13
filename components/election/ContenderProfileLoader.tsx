"use client";

import { useEffect, useState } from "react";

import { ContenderProfile } from "@/components/election/ContenderProfile";
import { SelfAuthoredNotice } from "@/components/election/SelfAuthoredNotice";
import { Card, CardContent } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { INDIVIDUAL_MEMBERSHIP_OVERRIDE_ADDRESS } from "@/config/security-council";
import {
  useElections,
  useNewestPublicCandidateProfile,
} from "@/hooks/use-candidate-profile";
import {
  electionIndexForRegistration,
  resolveCandidate,
} from "@/lib/election-profile";
import {
  getCandidate,
  type TallyElectionCandidate,
} from "@/lib/election-utils";

/**
 * Which election a registration was for. The indexer's copy does not say, so it
 * is placed by date once the election list has loaded.
 */
function registrationElection(
  candidate: TallyElectionCandidate,
  elections: { electionIndex: number | null; startedAt: string }[] | undefined
): number | null {
  if (candidate.electionIndex != null) return candidate.electionIndex;
  return elections
    ? electionIndexForRegistration(candidate.registeredAt, elections)
    : null;
}

type ContenderProfileState = {
  address: string;
  candidate: TallyElectionCandidate | null;
  error: string | null;
  isLoading: boolean;
};

/**
 * A contender's profile for one election (or the latest, without one): the
 * exported Tally registration for that election, overlaid by what the candidate
 * published for it through SIWE. Another election's registration never stands
 * in, since the same people run again with different profiles.
 */
export function ContenderProfileLoader({
  address,
  electionIndex,
  initialCandidate,
  registrationSnapshot,
}: {
  address: string;
  electionIndex?: number;
  initialCandidate?: TallyElectionCandidate | null;
  registrationSnapshot?: TallyElectionCandidate | null;
}): React.ReactElement {
  const hasInitialCandidate =
    initialCandidate?.address.toLowerCase() === address.toLowerCase();
  const isIndividualMembershipOverride =
    address.toLowerCase() === INDIVIDUAL_MEMBERSHIP_OVERRIDE_ADDRESS;
  // The copy around the archived profile below is specific to this member.
  const originalCandidate =
    isIndividualMembershipOverride &&
    registrationSnapshot?.address.toLowerCase() === address.toLowerCase()
      ? registrationSnapshot
      : null;
  const [state, setState] = useState<ContenderProfileState>({
    address,
    candidate: hasInitialCandidate ? initialCandidate : null,
    error: null,
    isLoading: !hasInitialCandidate,
  });

  useEffect(() => {
    let cancelled = false;

    getCandidate(address)
      .then((nextCandidate) => {
        if (!cancelled) {
          setState({
            address,
            candidate:
              nextCandidate ?? (hasInitialCandidate ? initialCandidate : null),
            error: null,
            isLoading: false,
          });
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setState({
            address,
            candidate: hasInitialCandidate ? initialCandidate : null,
            error: hasInitialCandidate
              ? null
              : err instanceof Error
                ? err.message
                : String(err),
            isLoading: false,
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [address, hasInitialCandidate, initialCandidate]);

  // A candidate can keep their own profile current through SIWE. That overlays
  // the static Tally snapshot below — it never replaces it, so a field the
  // candidate has not touched still shows what was exported. An election's page
  // shows that election's profile; the address-only page shows the newest from
  // any election, so starting a new election does not hide one.
  const { data: elections } = useElections();
  const { profile: selfAuthored, election: selfAuthoredElection } =
    useNewestPublicCandidateProfile(
      electionIndex === undefined
        ? elections
        : elections?.filter((e) => e.electionIndex === electionIndex),
      address
    );

  const isLoading =
    !hasInitialCandidate && (state.address !== address || state.isLoading);
  const loaded =
    state.address === address
      ? state.candidate
      : hasInitialCandidate
        ? initialCandidate
        : null;
  // The server already placed `initialCandidate` for this page's election, so a
  // refreshed copy from the indexer replaces it only when it is the same run.
  const candidate =
    electionIndex === undefined ||
    loaded === null ||
    registrationElection(loaded, elections) === electionIndex
      ? loaded
      : (initialCandidate ?? null);
  const error = hasInitialCandidate && state.isLoading ? null : state.error;

  if (isLoading) {
    return (
      <Card variant="glass">
        <CardContent className="space-y-4 py-6">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-40 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card variant="glass">
        <CardContent className="py-6 text-sm text-destructive">
          Failed to load candidate profile: {error}
        </CardContent>
      </Card>
    );
  }

  // Nothing from either source: leave ContenderProfile to render its own
  // address-only fallback rather than handing it a synthesized empty record.
  if (!candidate && !selfAuthored) {
    return <ContenderProfile address={address} candidate={null} />;
  }

  // Temporary until the indexer reflects Alejandro's individual membership.
  // This replaces the stale indexer record before the SIWE overlay, so his own
  // edits still win.
  const baseCandidate =
    candidate && isIndividualMembershipOverride && hasInitialCandidate
      ? {
          ...candidate,
          name: initialCandidate.name,
          title: initialCandidate.title,
          type: initialCandidate.type,
          representative: initialCandidate.representative,
          country: initialCandidate.country,
          motivation: initialCandidate.motivation,
          experience: initialCandidate.experience,
          skills: initialCandidate.skills,
          projects: initialCandidate.projects,
        }
      : candidate;
  const resolved = resolveCandidate(
    address,
    baseCandidate,
    selfAuthored ?? null
  );
  const candidateForDisplay = resolved.candidate;

  return (
    <div className="space-y-6">
      <SelfAuthoredNotice
        resolved={resolved}
        // An election's own page already says which election this is.
        election={electionIndex === undefined ? selfAuthoredElection : null}
        isInCandidateRegistry={candidate !== null}
      />
      {originalCandidate ? (
        <section aria-label="Current Council membership" className="space-y-4">
          <header className="space-y-2">
            <h2 className="text-lg font-semibold">
              Current Council membership
            </h2>
            <p className="text-sm text-muted-foreground">
              Current membership information, reflecting Alejandro&apos;s
              individual service. The original profile delegates voted on is
              preserved below. See the{" "}
              <a
                href="https://forum.arbitrum.foundation/t/security-council-membership-rotation-november-2026/31682"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 hover:text-foreground"
              >
                membership announcement
              </a>
              .
            </p>
          </header>
          <ContenderProfile address={address} candidate={candidateForDisplay} />
        </section>
      ) : (
        <ContenderProfile address={address} candidate={candidateForDisplay} />
      )}
      {originalCandidate && (
        <details className="rounded-xl border border-border/50 p-4">
          <summary className="cursor-pointer text-base font-semibold">
            Original candidate profile — {originalCandidate.name}
          </summary>
          <div className="mt-4 space-y-4">
            <p className="text-sm text-muted-foreground">
              Immunefi&apos;s original registration for the September 2025
              Security Council election. This is the profile delegates voted on,
              preserved with its original wording and skill ratings.
            </p>
            <ContenderProfile
              address={address}
              candidate={originalCandidate}
              showVoting={false}
            />
          </div>
        </details>
      )}
    </div>
  );
}
