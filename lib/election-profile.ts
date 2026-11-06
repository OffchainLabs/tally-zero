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

import * as z from "zod";

import type {
  CandidateProfileVersion,
  ElectionPhase,
  ElectionSummary,
} from "@/lib/siwe/types";
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

const TWITTER_HOSTS = new Set([
  "x.com",
  "www.x.com",
  "twitter.com",
  "www.twitter.com",
  "mobile.twitter.com",
]);

// These first path segments belong to X itself, not to an account. Apply this
// to bare values too, including ones normalized by an older client.
const TWITTER_ROUTES = new Set([
  "i",
  "intent",
  "home",
  "explore",
  "search",
  "notifications",
  "messages",
  "settings",
  "compose",
  "login",
  "logout",
  "signup",
  "share",
  "hashtag",
  "account",
]);

export const TWITTER_HANDLE_MESSAGE =
  "Enter a Twitter / X handle, like @handle.";

/**
 * X's own rule for handles: letters, digits and underscores, at most 15.
 *
 * `abort` matters: when every branch of a zod 4 union fails but exactly one
 * failed without aborting, the union reports that branch's raw issue instead
 * of its own message. Aborting here keeps the union's message.
 */
const handleSchema = z
  .string()
  .regex(/^[A-Za-z0-9_]{1,15}$/, { abort: true })
  .refine((handle) => !TWITTER_ROUTES.has(handle.toLowerCase()), {
    abort: true,
  });

const bareHandleSchema = z
  .string()
  .transform((value) => value.replace(/^@/, ""))
  .pipe(handleSchema);

/** A profile or post URL whose first path segment identifies an account. */
const profileUrlSchema = z
  .string()
  .url()
  .transform((value, ctx) => {
    const { protocol, hostname, pathname } = new URL(value);
    const accountPath =
      /^\/([^/]+)(?:\/status\/\d+(?:\/(?:photo|video)\/\d+)?)?\/?$/.exec(
        pathname
      );
    if (
      !/^https?:$/.test(protocol) ||
      !TWITTER_HOSTS.has(hostname.toLowerCase()) ||
      !accountPath
    ) {
      ctx.addIssue({ code: "custom" });
      return z.NEVER;
    }
    return accountPath[1];
  })
  .pipe(handleSchema);

/**
 * Parses a Twitter field to the bare X handle.
 *
 * SIWE should hold a handle, but the indexer doesn't validate the field, and
 * the static export stores a full profile URL. So this accepts a handle (with
 * or without the `@`) or a URL on an X host. Anything else, a foreign host
 * included, fails.
 */
export const twitterHandleSchema = z
  .string()
  .trim()
  .pipe(
    z.union([bareHandleSchema, profileUrlSchema], {
      error: TWITTER_HANDLE_MESSAGE,
    })
  );

/** The bare X handle in `value`, or null if there isn't one. */
export function toTwitterHandle(value: string | null): string | null {
  const result = twitterHandleSchema.safeParse(value);
  return result.success ? result.data : null;
}

/**
 * The link the X icon points at. It is always built from a validated handle,
 * never passed through, because a self-authored value is unvetted.
 */
export function toTwitterUrl(value: string | null): string | null {
  const handle = toTwitterHandle(value);
  return handle ? `https://x.com/${handle}` : null;
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
    // A Twitter value that holds no handle falls through the same way, so it
    // neither erases the export's link nor gets credited to the candidate.
    const useSelf =
      typeof own === "string" &&
      own.trim() !== "" &&
      (field !== "twitter" || toTwitterHandle(own) !== null);
    sources[field] = useSelf ? "self" : "static";
    if (useSelf) candidate[field] = own;
  }

  candidate.twitter = toTwitterUrl(candidate.twitter);

  return {
    candidate,
    sources,
    // Deduped: the editor does not, and the UI keys a badge per skill.
    selfReportedSkills: [...new Set(self?.skills ?? [])],
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
  return electionsNewestFirst(elections)[0]?.id ?? null;
}

/** Most recently started first. Does not mutate the input. */
export function electionsNewestFirst<T extends { startedAt: string }>(
  elections: T[]
): T[] {
  return [...elections].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

/** Matches the election selector: the governor numbers from 0, people from 1. */
export function electionLabel(
  election: Pick<ElectionSummary, "electionIndex" | "cohort">
): string {
  return election.electionIndex === null
    ? `Cohort ${election.cohort}`
    : `Election #${election.electionIndex + 1}`;
}

export const ELECTION_PHASE_LABEL: Record<ElectionPhase, string> = {
  CONTENDER_SUBMISSION: "Contender submission",
  NOMINEE_SELECTION: "Nominee selection",
  COMPLIANCE_CHECK: "Compliance check",
  MEMBER_ELECTION: "Member election",
  PENDING_EXECUTION: "Awaiting execution",
  COMPLETED: "Completed",
};

/**
 * Contender pages are per election: the same people run again, and each run
 * has its own profile. Without an election the page shows the latest one.
 */
export function contenderPath(
  address: string,
  electionIndex?: number | null
): string {
  const lower = address.toLowerCase();
  return electionIndex == null
    ? `/security-council/contender/${lower}`
    : `/security-council/elections/${electionIndex}/contender/${lower}`;
}

/**
 * The election a Tally registration belongs to: the latest one started at or
 * before it. Registration is only open in the week after an election starts,
 * and elections are months apart, so this is unambiguous for real records.
 */
export function electionIndexForRegistration(
  registeredAt: string | null,
  elections: { electionIndex: number | null; startedAt: string }[]
): number | null {
  if (!registeredAt) return null;
  const at = Date.parse(registeredAt);
  let match: { electionIndex: number; startedAt: number } | null = null;
  for (const election of elections) {
    if (election.electionIndex === null) continue;
    const startedAt = Date.parse(election.startedAt);
    if (startedAt <= at && (!match || startedAt > match.startedAt)) {
      match = { electionIndex: election.electionIndex, startedAt };
    }
  }
  return match?.electionIndex ?? null;
}
