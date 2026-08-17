"use client";

import { ShieldAlert, UserCheck } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import type { ResolvedCandidate } from "@/lib/election-profile";

const FIELD_LABEL: Record<string, string> = {
  name: "Name",
  title: "Title",
  twitter: "Twitter",
  type: "Type",
  representative: "Representative",
  motivation: "Motivation",
  experience: "Experience",
  projects: "Projects",
  country: "Country",
};

/**
 * Attribution for the parts of a contender profile the candidate wrote
 * themselves, plus their free-form skill list.
 *
 * Two things need saying to a reader, and neither is inferable from the profile
 * itself:
 *
 *   1. Which fields are self-published rather than from the Tally export. The
 *      export was a vetted snapshot taken at registration; a SIWE profile is
 *      whatever the address holder wrote a moment ago.
 *   2. Whether the address is in the candidate registry at all. The
 *      candidate-profile API does not check that the author is a contender, so
 *      any signed-in address can publish a profile against any election. Until
 *      that is enforced server-side, an unregistered address must not be able to
 *      borrow the look of a vetted candidate page.
 *
 * `skills` is listed here rather than merged into the profile because the two
 * sources are different data: the export holds numeric proficiency ratings, a
 * SIWE profile holds a flat list of words.
 */
export function SelfAuthoredNotice({
  resolved,
  isInCandidateRegistry,
}: {
  resolved: ResolvedCandidate;
  isInCandidateRegistry: boolean;
}) {
  const { sources, selfReportedSkills, hasSelfAuthored } = resolved;

  if (!hasSelfAuthored && selfReportedSkills.length === 0) return null;

  const selfFields = Object.entries(sources)
    .filter(([, source]) => source === "self")
    .map(([field]) => FIELD_LABEL[field] ?? field);

  return (
    <Card
      variant="glass"
      className={isInCandidateRegistry ? undefined : "border-amber-500/40"}
    >
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {isInCandidateRegistry ? (
            <>
              <UserCheck className="h-4 w-4" />
              Updated by the candidate
            </>
          ) : (
            <>
              <ShieldAlert className="h-4 w-4 text-amber-500" />
              Self-published profile
            </>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-muted-foreground">
        {!isInCandidateRegistry ? (
          <p className="text-amber-400" data-testid="candidate-unverified">
            This address is not in the Security Council candidate registry.
            Everything below was published by whoever controls the address and
            has not been verified against an election.
          </p>
        ) : null}

        {selfFields.length > 0 ? (
          <p data-testid="candidate-self-fields">
            Written by the candidate: {selfFields.join(", ")}. Any other field
            comes from the registration snapshot.
          </p>
        ) : null}

        {selfReportedSkills.length > 0 ? (
          <div className="space-y-2">
            <p>Skills listed by the candidate:</p>
            <div className="flex flex-wrap gap-1.5">
              {selfReportedSkills.map((skill) => (
                <Badge key={skill} variant="outline">
                  {skill}
                </Badge>
              ))}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
