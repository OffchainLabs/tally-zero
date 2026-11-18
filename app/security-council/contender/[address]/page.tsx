import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { isAddress } from "viem";

import { ContenderProfileLoader } from "@/components/election/ContenderProfileLoader";
import { contenderPath } from "@/lib/election-profile";
import { pageMetadata } from "@/lib/seo";
import {
  getCachedElectionCandidate,
  getCachedElectionCandidateStaticParams,
  getElectionCandidateRegistrationSnapshot,
} from "@/lib/tally-data/server";
import type { Metadata } from "next";

interface ContenderPageProps {
  params: Promise<{ address: string }>;
}

export async function generateMetadata({
  params,
}: ContenderPageProps): Promise<Metadata> {
  const { address } = await params;
  if (!isAddress(address, { strict: false })) notFound();
  return pageMetadata({
    title: "Security Council Candidate Profile",
    description:
      "View candidate profile for the Arbitrum Security Council election.",
    path: `/security-council/contender/${address.toLowerCase()}`,
  });
}

export const dynamicParams = true;
export const revalidate = false;

export async function generateStaticParams() {
  const params = await getCachedElectionCandidateStaticParams();
  return params.map(({ address }) => ({ address }));
}

export default async function ContenderPage({ params }: ContenderPageProps) {
  const { address } = await params;
  // A valid address that is not a known candidate still renders: the loader
  // may find it in a newer cycle. Anything that is not an address cannot, and
  // with dynamicParams and revalidate = false it would be cached for good.
  if (!isAddress(address, { strict: false })) notFound();
  const initialCandidate = await getCachedElectionCandidate(address);
  // Profiles are per election. An exported registration names its election, so
  // send the address-only link there; otherwise show the latest election.
  if (initialCandidate?.electionIndex != null) {
    redirect(contenderPath(address, initialCandidate.electionIndex));
  }
  const registrationSnapshot =
    getElectionCandidateRegistrationSnapshot(address);

  return (
    <div className="space-y-6 pb-8 pt-6 md:pb-12 md:pt-10 lg:py-16">
      <div className="container flex flex-col gap-6">
        <div>
          <Link
            href="/security-council"
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
          registrationSnapshot={registrationSnapshot}
        />
      </div>
    </div>
  );
}
