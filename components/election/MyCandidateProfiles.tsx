"use client";

import { useState } from "react";

import { CandidateProfileEditor } from "@/components/election/CandidateProfileEditor";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { useElections } from "@/hooks/use-candidate-profile";
import { useSiwe } from "@/hooks/use-siwe";
import { latestElectionId } from "@/lib/election-profile";

/**
 * Pick an election, then edit that election's candidate profile.
 *
 * Profiles are per-election rather than per-person, so a candidate standing in
 * two cohorts has two independent profiles. Defaulting to the most recent
 * election is the useful case; older ones stay reachable and read-only.
 */
export function MyCandidateProfiles() {
  const { data: elections, isLoading, error } = useElections();
  const { effectiveAddress } = useSiwe();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (isLoading) return <Skeleton className="h-64 w-full" />;

  if (error) {
    return (
      <p className="text-sm text-destructive" data-testid="elections-error">
        {error.message}
      </p>
    );
  }

  if (!elections || elections.length === 0) {
    return (
      <Card variant="glass">
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">
            No elections have been indexed yet. A candidate profile can only be
            written against an election that exists on chain.
          </p>
        </CardContent>
      </Card>
    );
  }

  // The default is resolved here rather than in state so it survives the list
  // arriving after the first render.
  const activeId = selectedId ?? latestElectionId(elections);
  const active = elections.find((e) => e.id === activeId) ?? elections[0];

  return (
    <div className="space-y-4">
      {elections.length > 1 ? (
        <div className="flex flex-wrap gap-2" data-testid="election-picker">
          {elections.map((election) => (
            <Button
              key={election.id}
              size="sm"
              variant={election.id === active.id ? "default" : "outline"}
              onClick={() => setSelectedId(election.id)}
            >
              Cohort {election.cohort}
            </Button>
          ))}
        </div>
      ) : null}

      {/* Keyed on both the subject and the election, so switching either resets
          the editor whole rather than carrying one identity's edits into
          another. It has to be the editor and not the form inside it: the save
          mutation lives at this level, so a key any lower would leave one
          subject's in-flight save disabling and erroring the next subject's
          form. An unmounted save still finishes and still refreshes its caches,
          because the mutation outlives its observer. */}
      <CandidateProfileEditor
        key={`${effectiveAddress?.toLowerCase()}:${active.id}`}
        election={active}
      />
    </div>
  );
}
