"use client";

import { useEffect, useState } from "react";

import { ContenderProfile } from "@/components/election/ContenderProfile";
import { Card, CardContent } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  getTallyDataClient,
  type TallyElectionCandidate,
} from "@/lib/tally-data/client";

type ContenderProfileState = {
  address: string;
  candidate: TallyElectionCandidate | null;
  error: string | null;
  isLoading: boolean;
};

export function ContenderProfileLoader({
  address,
}: {
  address: string;
}): React.ReactElement {
  const [state, setState] = useState<ContenderProfileState>({
    address,
    candidate: null,
    error: null,
    isLoading: true,
  });

  useEffect(() => {
    let cancelled = false;

    getTallyDataClient()
      .getCandidate(address)
      .then((nextCandidate) => {
        if (!cancelled) {
          setState({
            address,
            candidate: nextCandidate,
            error: null,
            isLoading: false,
          });
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setState({
            address,
            candidate: null,
            error: err instanceof Error ? err.message : String(err),
            isLoading: false,
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [address]);

  const isLoading = state.address !== address || state.isLoading;
  const { candidate, error } = state;

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
