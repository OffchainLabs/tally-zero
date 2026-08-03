import "server-only";

import { unstable_cache } from "next/cache";

import electionCandidates from "@/data/election-candidates.json";
import type {
  TallyAddressDisplayRecord,
  TallyElectionCandidate,
} from "@/lib/tally-data/types";

type ElectionCandidateJson = {
  address?: string;
  name?: string;
  title?: string | null;
  twitter?: string | null;
  type?: string | null;
  representative?: string | null;
  motivation?: string | null;
  experience?: string | null;
  skills?: unknown;
  projects?: string | null;
  country?: string | null;
  registered_at?: string | null;
  message?: string | null;
  signatureHash?: string | null;
};

function toElectionCandidate(
  key: string,
  candidate: ElectionCandidateJson
): TallyElectionCandidate {
  const address = candidate.address ?? key;
  return {
    address,
    name: candidate.name ?? "",
    title: candidate.title ?? null,
    twitter: candidate.twitter ?? null,
    type: candidate.type ?? null,
    representative: candidate.representative ?? null,
    motivation: candidate.motivation ?? null,
    experience: candidate.experience ?? null,
    skills: candidate.skills ?? null,
    projects: candidate.projects ?? null,
    country: candidate.country ?? null,
    registeredAt: candidate.registered_at ?? null,
    message: candidate.message ?? null,
    signatureHash: candidate.signatureHash ?? null,
  };
}

const getElectionCandidates = unstable_cache(
  async (): Promise<TallyElectionCandidate[]> => {
    return Object.entries(
      electionCandidates as Record<string, ElectionCandidateJson>
    )
      .map(([key, candidate]) => toElectionCandidate(key, candidate))
      .sort((a, b) => a.address.localeCompare(b.address));
  },
  ["tally-zero-election-candidates-v2"],
  { revalidate: false }
);

export async function getCachedElectionAddressDisplayRecords(): Promise<
  TallyAddressDisplayRecord[]
> {
  const candidates = await getElectionCandidates();
  return candidates.map((candidate) => ({
    address: candidate.address,
    label: candidate.name || null,
    title: candidate.title,
    picture: null,
    profileUrl: `/security-council/contender/${candidate.address.toLowerCase()}`,
    source: "candidate",
  }));
}

export async function getCachedElectionCandidate(
  address: string
): Promise<TallyElectionCandidate | null> {
  const addressLower = address.toLowerCase();
  const candidates = await getElectionCandidates();
  return (
    candidates.find(
      (candidate) => candidate.address.toLowerCase() === addressLower
    ) ?? null
  );
}

export async function getCachedElectionCandidateStaticParams(): Promise<
  Array<{ address: string }>
> {
  const candidates = await getElectionCandidates();
  return candidates.map((candidate) => ({
    address: candidate.address.toLowerCase(),
  }));
}
