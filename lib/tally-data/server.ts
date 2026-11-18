import "server-only";

import { unstable_cache } from "next/cache";

import electionCandidateHistory from "@/data/election-candidate-history.json";
import electionCandidateRegistrationSnapshots from "@/data/election-candidate-registration-snapshots.json";
import electionCandidates from "@/data/election-candidates.json";
import { contenderPath } from "@/lib/election-profile";
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
  electionIndex?: number | null;
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
    electionIndex: candidate.electionIndex ?? null,
  };
}

/**
 * Registrations from earlier runs, keyed by election then address
 * (scripts/backfill-candidate-history.ts). The export holds only each
 * candidate's latest registration; these are the others.
 */
const getEarlierRegistrations = unstable_cache(
  async (): Promise<TallyElectionCandidate[]> =>
    Object.values(
      electionCandidateHistory as Record<
        string,
        Record<string, ElectionCandidateJson>
      >
    ).flatMap((byAddress) =>
      Object.entries(byAddress).map(([key, candidate]) =>
        toElectionCandidate(key, candidate)
      )
    ),
  ["tally-zero-election-candidate-history-v1"],
  { revalidate: false }
);

const getElectionCandidates = unstable_cache(
  async (): Promise<TallyElectionCandidate[]> => {
    return Object.entries(
      electionCandidates as Record<string, ElectionCandidateJson>
    )
      .map(([key, candidate]) => toElectionCandidate(key, candidate))
      .sort((a, b) => a.address.localeCompare(b.address));
  },
  ["tally-zero-election-candidates-v5"],
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
    profileUrl: contenderPath(candidate.address, candidate.electionIndex),
    source: "candidate",
  }));
}

/**
 * The exported registration for an address. With an election, only the one
 * registered for that election: the export keeps a candidate's latest
 * registration, which must not stand in for an earlier run.
 */
export async function getCachedElectionCandidate(
  address: string,
  electionIndex?: number
): Promise<TallyElectionCandidate | null> {
  const addressLower = address.toLowerCase();
  const candidates = await getElectionCandidates();
  const candidate =
    candidates.find(
      (candidate) => candidate.address.toLowerCase() === addressLower
    ) ?? null;
  if (electionIndex === undefined) return candidate;
  if (candidate?.electionIndex === electionIndex) return candidate;
  const earlier = await getEarlierRegistrations();
  return (
    earlier.find(
      (registration) =>
        registration.electionIndex === electionIndex &&
        registration.address.toLowerCase() === addressLower
    ) ?? null
  );
}

/** Original submissions retained when a member's current profile changes. */
export function getElectionCandidateRegistrationSnapshot(
  address: string
): TallyElectionCandidate | null {
  const snapshot = Object.entries(electionCandidateRegistrationSnapshots).find(
    ([key]) => key.toLowerCase() === address.toLowerCase()
  );
  return snapshot ? toElectionCandidate(snapshot[0], snapshot[1]) : null;
}

export async function getCachedElectionCandidateStaticParams(): Promise<
  Array<{ electionIndex: string; address: string }>
> {
  const candidates = [
    ...(await getElectionCandidates()),
    ...(await getEarlierRegistrations()),
  ];
  return candidates.flatMap((candidate) =>
    candidate.electionIndex == null
      ? []
      : [
          {
            electionIndex: String(candidate.electionIndex),
            address: candidate.address.toLowerCase(),
          },
        ]
  );
}
