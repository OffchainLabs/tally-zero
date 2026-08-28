// Query keys for the SIWE surface.
//
// The indexer resolves every "about me" read and write against
// `effectiveSubject = actingAs ?? address`. That makes act-as a *global* mode:
// the instant it flips, the same URL means a different subject. Caching across
// that boundary is not just a stale-read bug — it can show one entity's data in
// a form whose Save writes it to another.
//
// So every subject-scoped key nests under one shared prefix that carries the
// effective address. Two things fall out of that: a cached entry can never be
// read as another subject's, and one removeQueries(SUBJECT_SCOPE) evicts all of
// them, so a subject-scoped query added later is covered the moment it is
// written, with no list to keep in sync.
//
// One exception, and it is why a subject switch is two calls rather than one:
// `me` sits outside SUBJECT_SCOPE (see below) yet its payload carries the
// effective subject's resolved profile and ownedFields, so
// removeQueries(SUBJECT_SCOPE) leaves it behind. Switching subject means
// invalidating `me` first, so the new subject is known, then removing
// SUBJECT_SCOPE.
//
// Three scopes, and they are genuinely different:
//   - subject-scoped: profile, drafts, candidate profiles → keyed on effectiveAddress
//   - signer-scoped:  /api/auth/safes reads session.address, NOT the effective
//                     subject, so acting-as must not change it → keyed on signer
//   - public:         no session involved → no identity in the key

// Scope roots. Query keys match by prefix (query-core matchQuery falls through
// to partialMatchKey unless `exact` is set), so invalidating or removing a root
// covers every key nested under it — no per-key list to keep in sync.

/** Root of everything that belongs to one effective subject. */
export const SUBJECT_SCOPE = ["siwe", "subject"] as const;

/** Root of the signer-scoped Safe recall list. */
export const SAFES_SCOPE = ["siwe", "safes"] as const;

// Addresses reach these keys in two casings — the indexer's `effectiveAddress`
// and wagmi's checksummed `address` — and one subject must never occupy two
// cache entries, or a write through one leaves the other stale. Lowercasing here
// matches how the sibling hooks key an address (use-user-vote, use-delegate-votes).
const addr = (value: string) => value.toLowerCase();

// An election id is `${governorAddress}:${proposalId}` (see types.ts), so its
// leading segment is an address and gets the same treatment as a bare one:
// governor addresses arrive lowercase from the indexer and checksummed from
// config/governors.ts, so an id built from either source has to key the same.
// Only the first colon is split on, and the proposal id is passed through
// untouched rather than lowercased, so nothing here depends on its alphabet.
const electionKey = (electionId: string) => {
  const colon = electionId.indexOf(":");
  if (colon === -1) return electionId;
  return addr(electionId.slice(0, colon)) + electionId.slice(colon);
};

const subjectKey = (subject: string, ...rest: string[]) =>
  [...SUBJECT_SCOPE, addr(subject), ...rest] as const;

export const siweKeys = {
  /**
   * Session envelope. Deliberately outside SUBJECT_SCOPE because it *carries*
   * the subject, so it cannot be keyed on it.
   *
   * It is not a pure envelope though: /api/me answers with the effective
   * subject's resolved profile and ownedFields too. That makes this the one key
   * a subject switch has to evict by name, before removing SUBJECT_SCOPE.
   */
  me: ["siwe", "me"] as const,

  /**
   * Signer-scoped — the Safe recall list belongs to the signed-in address, not
   * the effective subject, so acting as a Safe must not move it.
   *
   * Takes `string | undefined` because the caller builds this key before the
   * session resolves; that is the documented dependent-query shape (the query
   * is gated by `enabled`, so a key holding undefined never fetches).
   */
  safes: (signer: string | undefined) =>
    [...SAFES_SCOPE, signer && addr(signer)] as const,

  /** Subject-scoped — all evicted together by SUBJECT_SCOPE. */
  profile: (subject: string) => subjectKey(subject, "profile"),
  drafts: (subject: string) => subjectKey(subject, "drafts"),
  // Nested under drafts() so invalidating the list also refreshes each draft.
  draft: (subject: string, id: string) => subjectKey(subject, "drafts", id),
  candidateProfile: (subject: string, electionId: string) =>
    subjectKey(subject, "candidate-profile", electionKey(electionId)),

  /** Public — unauthenticated reads, shared across all viewers. */
  elections: ["siwe", "elections"] as const,
  sharedDraft: (slug: string) => ["siwe", "shared-draft", slug] as const,
  publicCandidateProfile: (electionId: string, address: string) =>
    [
      "siwe",
      "public-candidate-profile",
      electionKey(electionId),
      addr(address),
    ] as const,
};
