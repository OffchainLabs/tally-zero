"use client";

import { useEffect, useState } from "react";

import { ContenderProfile } from "@/components/election/ContenderProfile";
import { Card, CardContent } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
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

  return <ContenderProfile address={address} candidate={candidate} />;
}
