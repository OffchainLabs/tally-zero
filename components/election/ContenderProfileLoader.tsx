"use client";

import { useEffect, useState } from "react";

import { ContenderProfile } from "@/components/election/ContenderProfile";
import { SelfAuthoredNotice } from "@/components/election/SelfAuthoredNotice";
import { Card, CardContent } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  useElections,
  useNewestPublicCandidateProfile,
} from "@/hooks/use-candidate-profile";
import { resolveCandidate } from "@/lib/election-profile";
import {
  getCandidate,
  type TallyElectionCandidate,
} from "@/lib/election-utils";

type ContenderProfileState = {
  address: string;
  candidate: TallyElectionCandidate | null;
  error: string | null;
  isLoading: boolean;
};

export function ContenderProfileLoader({
  address,
  initialCandidate,
  registrationSnapshot,
}: {
  address: string;
  initialCandidate?: TallyElectionCandidate | null;
  registrationSnapshot?: TallyElectionCandidate | null;
}): React.ReactElement {
  const hasInitialCandidate =
    initialCandidate?.address.toLowerCase() === address.toLowerCase();
  const originalCandidate =
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
  // candidate has not touched still shows what was exported. The newest profile
  // from any election is used, so starting a new election does not hide one.
  const { data: elections } = useElections();
  const { profile: selfAuthored, election: selfAuthoredElection } =
    useNewestPublicCandidateProfile(elections, address);

  const isLoading =
    !hasInitialCandidate && (state.address !== address || state.isLoading);
  const candidate =
    state.address === address
      ? state.candidate
      : hasInitialCandidate
        ? initialCandidate
        : null;
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

  const resolved = resolveCandidate(address, candidate, selfAuthored ?? null);
  // Temporary until the indexer reflects Alejandro's individual membership.
  const candidateForDisplay =
    address.toLowerCase() === "0x0cd9e52891a0a48d45b0c61a31086be8361ef157" &&
    hasInitialCandidate
      ? {
          ...resolved.candidate,
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
      : resolved.candidate;

  return (
    <div className="space-y-6">
      <SelfAuthoredNotice
        resolved={resolved}
        election={selfAuthoredElection}
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
