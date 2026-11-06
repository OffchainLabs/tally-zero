"use client";

import Link from "next/link";

import { useCurrentElection } from "@/hooks/use-candidate-profile";

/**
 * Points candidates at the profile editor, but only while an election is taking
 * them: new profiles are accepted only during Contender Submission.
 */
export function CandidateProfileLink() {
  const { data } = useCurrentElection();
  if (!data?.contenderSubmissionOpen) return null;
  return (
    <p>
      Standing in a Security Council election?{" "}
      <Link
        href="/security-council/candidate"
        className="text-primary hover:underline"
      >
        Publish your candidate profile
      </Link>
      .
    </p>
  );
}
