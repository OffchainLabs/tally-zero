import { MyCandidateProfiles } from "@/components/election/MyCandidateProfiles";
import { SiweGate } from "@/components/siwe/SiweGate";
import type { Metadata } from "next";

export const metadata: Metadata = {
  // The root layout's title template appends the site name.
  title: "My Candidate Profile",
  description:
    "Sign in with your wallet to publish a Security Council candidate profile.",
  // Account-bound, like the other wallet-gated pages: keep it out of search.
  robots: { index: false, follow: true },
};

export default function CandidateProfilePage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <div className="flex flex-col gap-2">
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
