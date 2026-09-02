import { MyCandidateProfiles } from "@/components/election/MyCandidateProfiles";
import { SiweGate } from "@/components/siwe/SiweGate";

export const metadata = {
  title: "My Candidate Profile | Arbitrum Governance",
  description:
    "Sign in with your wallet to publish a Security Council candidate profile.",
};

export default function ElectionsPage() {
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
      <SiweGate>
        <MyCandidateProfiles />
      </SiweGate>
    </div>
  );
}
