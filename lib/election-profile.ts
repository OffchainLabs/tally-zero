// Merges a candidate's self-authored SIWE profile over the static Tally export.
//
// The static data (data/election-candidates.json, 154 records keyed by address)
// was a one-off snapshot; SIWE lets a candidate keep it current. Nine of the ten
// fields correspond exactly — both sides are `string | null` — so those merge
// field by field with SIWE winning.
//
// `skills` does not merge, and pretending otherwise would lose information in
// both directions: the static shape is a ratings object
// (`{ canVerifySigning, golang, solidity, rust, javascript, cyberSecurity }`)
// while SIWE stores a flat `string[]`. There is no mapping between a
// self-reported "8/10 in Rust" and the word "Rust", so the two are surfaced
// separately and `TallyElectionCandidate.skills` keeps the static value.

import type { CandidateProfileVersion } from "@/lib/siwe/types";
import type { TallyElectionCandidate } from "@/lib/tally-data/types";

/** Fields where the two sources genuinely describe the same thing. */
const MERGEABLE = [
  "name",
  "title",
  "twitter",
  "type",
  "representative",
  "motivation",
  "experience",
  "projects",
  "country",
] as const;

type MergeableField = (typeof MERGEABLE)[number];

/**
 * The static export stores a full profile URL, SIWE stores a bare handle. The
 * link in the UI needs a URL, so normalize towards that and accept either.
 */
export function toTwitterUrl(value: string | null): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://x.com/${trimmed.replace(/^@/, "")}`;
}

export type CandidateFieldSource = "self" | "static";

export type ResolvedCandidate = {
  candidate: TallyElectionCandidate;
  /** Which source won each merged field, for attribution in the UI. */
  sources: Record<MergeableField, CandidateFieldSource>;
  /** SIWE-only: a flat skill list, with no static equivalent. */
  selfReportedSkills: string[];
  /** Whether any field at all came from the candidate themselves. */
  hasSelfAuthored: boolean;
};

/**
 * Resolve one candidate for display.
 *
 * `self` may be null (no SIWE profile) and `base` may be null (an address that
 * was never in the static export but has authored a profile) — the second case
 * is why this synthesizes a record rather than only patching one.
 */
export function resolveCandidate(
  address: string,
  base: TallyElectionCandidate | null,
  self: CandidateProfileVersion | null
): ResolvedCandidate {
  const candidate: TallyElectionCandidate = base
    ? { ...base }
    : {
        address,
        name: "",
        title: null,
        twitter: null,
        type: null,
        representative: null,
        motivation: null,
        experience: null,
        skills: null,
        projects: null,
        country: null,
        registeredAt: null,
        message: null,
        signatureHash: null,
      };

  const sources = {} as Record<MergeableField, CandidateFieldSource>;

  for (const field of MERGEABLE) {
    const own = self?.[field];
    // An empty string is a cleared field, not a value — fall through to static
    // so blanking a name does not render an untitled card.
    const useSelf = typeof own === "string" && own.trim() !== "";
    sources[field] = useSelf ? "self" : "static";
    if (useSelf) candidate[field] = own;
  }

  candidate.twitter = toTwitterUrl(candidate.twitter);

  return {
    candidate,
    sources,
    selfReportedSkills: self?.skills ?? [],
    hasSelfAuthored: Object.values(sources).some((s) => s === "self"),
  };
}

/**
 * The election a contender page should show a profile from: the most recently
 * started one. Candidate profiles are per-election, but a contender page is
 * addressed only by address, so it needs a default.
 */
export function latestElectionId(
  elections: { id: string; startedAt: string }[]
): string | null {
  const [latest] = [...elections].sort((a, b) =>
    b.startedAt.localeCompare(a.startedAt)
  );
  return latest?.id ?? null;
}
