import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
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

interface ElectionContenderPageProps {
  params: Promise<{ electionIndex: string; address: string }>;
}

export async function generateMetadata({
  params,
}: ElectionContenderPageProps): Promise<Metadata> {
  const { electionIndex, address } = await params;
  if (!/^\d+$/.test(electionIndex) || !isAddress(address, { strict: false })) {
    notFound();
  }
  return pageMetadata({
    title: `Security Council Election #${electionIndex} Candidate Profile`,
    description:
      "View a candidate's profile for one Arbitrum Security Council election.",
    path: contenderPath(address, Number(electionIndex)),
  });
}

export const dynamicParams = true;
export const revalidate = false;

export async function generateStaticParams() {
  return getCachedElectionCandidateStaticParams();
}

export default async function ElectionContenderPage({
  params,
}: ElectionContenderPageProps) {
  const { electionIndex: rawIndex, address } = await params;
  if (!/^\d+$/.test(rawIndex)) notFound();
  const electionIndex = Number(rawIndex);
  const initialCandidate = await getCachedElectionCandidate(
    address,
    electionIndex
  );
  // A snapshot keeps one registration's original wording, so it belongs only on
  // the page of the election that registration was for.
  const snapshot = getElectionCandidateRegistrationSnapshot(address);
  const registrationSnapshot =
    snapshot?.registeredAt != null &&
    snapshot.registeredAt === initialCandidate?.registeredAt
      ? snapshot
      : null;

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
            Security Council Election #{electionIndex + 1}
          </p>
        </div>

        <ContenderProfileLoader
          address={address}
          electionIndex={electionIndex}
          initialCandidate={initialCandidate}
          registrationSnapshot={registrationSnapshot}
        />
      </div>
    </div>
  );
}
