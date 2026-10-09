"use client";

import { useEffect, useState } from "react";

import { ContenderProfile } from "@/components/election/ContenderProfile";
import { SelfAuthoredNotice } from "@/components/election/SelfAuthoredNotice";
import { Card, CardContent } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  useElections,
  usePublicCandidateProfile,
} from "@/hooks/use-candidate-profile";
import { latestElectionId, resolveCandidate } from "@/lib/election-profile";
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
}: {
  address: string;
  initialCandidate?: TallyElectionCandidate | null;
}): React.ReactElement {
  const hasInitialCandidate =
    initialCandidate?.address.toLowerCase() === address.toLowerCase();
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
  // candidate has not touched still shows what was exported.
  const { data: elections } = useElections();
  const { data: selfAuthored } = usePublicCandidateProfile(
    latestElectionId(elections ?? []),
    address
  );

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

  return (
    <div className="space-y-6">
      <SelfAuthoredNotice
        resolved={resolved}
        isInCandidateRegistry={candidate !== null}
      />
      <ContenderProfile address={address} candidate={resolved.candidate} />
    </div>
  );
}
