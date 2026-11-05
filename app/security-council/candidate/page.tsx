import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { MyCandidateProfiles } from "@/components/election/MyCandidateProfiles";
import { SiweGate } from "@/components/siwe/SiweGate";

export const metadata = {
  title: "My Candidate Profile | Arbitrum Governance",
  description:
    "Sign in with your wallet to publish a Security Council candidate profile.",
};

export default function CandidateProfilePage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <div className="flex flex-col gap-2">
        {/* This route sits outside the (tabs) group, so it inherits no tab bar.
            The contender page solves that the same way. */}
        <Link
          href="/security-council"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Elections
        </Link>
        <h1 className="text-3xl font-bold tracking-tight">
          My Candidate Profile
        </h1>
        <p className="text-muted-foreground">
          Publish the profile shown on your contender page. Each save keeps the
          previous version, so the record of what you said and when stays
          intact.
        </p>
      </div>
      <SiweGate connectDescription="Connect your wallet to sign in and publish your candidate profile.">
        <MyCandidateProfiles />
      </SiweGate>
    </div>
  );
}
