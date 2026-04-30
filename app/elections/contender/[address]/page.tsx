import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { ContenderProfileLoader } from "@/components/election/ContenderProfileLoader";
import {
  getCachedElectionCandidate,
  getCachedElectionCandidateStaticParams,
} from "@/lib/tally-data/server";

interface ContenderPageProps {
  params: Promise<{ address: string }>;
}

export const metadata = {
  title: "Candidate Profile | Security Council Elections",
  description:
    "View candidate profile for the Arbitrum Security Council election.",
};

export const dynamicParams = true;
export const revalidate = false;

export async function generateStaticParams() {
  return getCachedElectionCandidateStaticParams();
}

export default async function ContenderPage({ params }: ContenderPageProps) {
  const { address } = await params;
  const initialCandidate = await getCachedElectionCandidate(address);

  return (
    <div className="space-y-6 pb-8 pt-6 md:pb-12 md:pt-10 lg:py-16">
      <div className="container flex flex-col gap-6">
        <div>
          <Link
            href="/elections"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors mb-4"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Elections
          </Link>
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
            Candidate Profile
          </h1>
          <p className="text-muted-foreground mt-2">
            Security Council election candidate
          </p>
        </div>

        <ContenderProfileLoader
          address={address}
          initialCandidate={initialCandidate}
        />
      </div>
    </div>
  );
}
