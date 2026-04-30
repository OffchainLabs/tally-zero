"use client";

import { useEffect, useState } from "react";

import { DelegateProfile } from "@/components/delegate/DelegateProfile";
import { Card, CardContent } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  getTallyDataClient,
  type TallyDelegateProfile,
} from "@/lib/tally-data/client";

type DelegateProfileState = {
  address: string;
  delegate: TallyDelegateProfile | null;
  error: string | null;
  isLoading: boolean;
};

export function DelegateProfileLoader({
  address,
}: {
  address: string;
}): React.ReactElement {
  const [state, setState] = useState<DelegateProfileState>({
    address,
    delegate: null,
    error: null,
    isLoading: true,
  });

  useEffect(() => {
    let cancelled = false;

    getTallyDataClient()
      .getDelegate(address)
      .then((nextDelegate) => {
        if (!cancelled) {
          setState({
            address,
            delegate: nextDelegate,
            error: null,
            isLoading: false,
          });
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setState({
            address,
            delegate: null,
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
  const { delegate, error } = state;

  if (isLoading) {
    return (
      <Card variant="glass">
        <CardContent className="space-y-4 py-6">
          <Skeleton className="h-16 w-16 rounded-full" />
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card variant="glass">
        <CardContent className="py-6 text-sm text-destructive">
          Failed to load delegate profile: {error}
        </CardContent>
      </Card>
    );
  }

  return <DelegateProfile address={address} delegate={delegate} />;
}
