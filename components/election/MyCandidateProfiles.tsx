"use client";

import { useState } from "react";

import { CandidateProfileEditor } from "@/components/election/CandidateProfileEditor";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  useCurrentElection,
  useElections,
} from "@/hooks/use-candidate-profile";
import { electionLabel, latestElectionId } from "@/lib/election-profile";
import type { CurrentElection } from "@/lib/siwe/types";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Whether candidates can publish now. New profiles are accepted only during an
 * election's Contender Submission period, which is when they can register.
 */
function SubmissionStatus({ current }: { current: CurrentElection }) {
  const { election, contenderSubmissionOpen, nextElectionAt } = current;
  let text: string;
  if (election && contenderSubmissionOpen) {
    text = election.contenderSubmissionEndsAt
      ? `Contender Submission for ${electionLabel(election)} is open until about ${formatDate(election.contenderSubmissionEndsAt)}.`
      : `Contender Submission for ${electionLabel(election)} is open.`;
  } else if (election) {
    text = `Contender Submission for ${electionLabel(election)} has closed. Existing profiles stay editable until the election completes.`;
  } else {
    text = nextElectionAt
      ? `No election is taking candidates. The next one can start on ${formatDate(nextElectionAt)}.`
      : "No election is taking candidates.";
  }
  return (
    <p
      className="text-sm text-muted-foreground"
      data-testid="submission-status"
    >
      {text}
    </p>
  );
}

/**
 * Pick an election, then edit that election's candidate profile.
 *
 * Profiles are per-election rather than per-person, so a candidate standing in
 * two cohorts has two independent profiles. Defaulting to the most recent
 * election is the useful case; older ones stay reachable and read-only.
 */
export function MyCandidateProfiles() {
  const { data: elections, isLoading, error } = useElections();
  const { data: current } = useCurrentElection();
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
        <CardContent className="space-y-2 pt-6">
          <p className="text-sm text-muted-foreground">
            No elections have been indexed yet. A candidate profile can only be
            written against an election that exists on chain.
          </p>
          {current ? <SubmissionStatus current={current} /> : null}
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
      {current ? <SubmissionStatus current={current} /> : null}
      {elections.length > 1 ? (
        <div className="flex flex-wrap gap-2" data-testid="election-picker">
          {elections.map((election) => (
            <Button
              key={election.id}
              size="sm"
              variant={election.id === active.id ? "default" : "outline"}
              onClick={() => setSelectedId(election.id)}
            >
              {electionLabel(election)}
            </Button>
          ))}
        </div>
      ) : null}

      {/* Keyed on the election so switching resets the form's hydration rather
          than carrying one election's edits into another. */}
      <CandidateProfileEditor key={active.id} election={active} />
    </div>
  );
}
