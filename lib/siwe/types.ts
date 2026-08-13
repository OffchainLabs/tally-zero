// Mirrors the indexer SIWE contract (packages/indexer/src/siwe/types.ts).
export type ProfileFields = {
  name: string | null;
  bio: string | null;
  picture: string | null;
  twitter: string | null;
  discourseUsername: string | null;
  discourseProfileLink: string | null;
  statement: string | null;
  isSeekingDelegation: boolean | null;
  issues: string[] | null;
};

export type ProfileSource = "owned" | "seed" | "ens" | null;

export type ResolvedProfile = ProfileFields & {
  sources: Record<keyof ProfileFields, ProfileSource>;
};

// GET /api/me. `safes` is a bare address list here; the enriched form (owners,
// threshold) only comes from GET /api/auth/safes — don't conflate the two.
export type MeResponse = {
  address: string;
  actingAs: string | null;
  effectiveAddress: string;
  profile: ResolvedProfile;
  ownedFields: string[];
  safes: string[];
};

// PATCH /api/me/profile, and GET /api/me/profile (same shape).
export type ProfilePatchResult = {
  owned: Partial<ProfileFields>;
  resolved: ResolvedProfile;
};

// GET /api/auth/safes. Every entry is re-read on chain, so a Safe that stops
// answering getOwners() silently drops out of the list.
export type KnownSafe = {
  address: string;
  name: string | null;
  owners: string[];
  threshold: number;
};

// POST/DELETE /api/auth/act-as. `actingAs` is null after DELETE.
export type ActAsResponse = {
  address: string;
  actingAs: string | null;
};

// Named for the draft API, not just `GovernorType`, because config/governors.ts
// already owns that name with different values ("core" | "treasury"). The
// drafts UI has to map between the two, so both end up imported side by side.
export type DraftGovernorType = "CONSTITUTIONAL" | "TREASURY";

export type DraftStatus = "draft" | "published" | "submitted";

export type DraftAction = {
  target: string;
  /** Decimal wei string, not hex. */
  value: string;
  calldata: string;
  signature?: string;
};

export type DraftFields = {
  title: string;
  description: string;
  governorType: DraftGovernorType;
  actions: DraftAction[];
};

export type DraftOnchain = {
  transactionHash: string;
  governorAddress: string;
  proposalId: string;
  submittedBy: string;
  submittedAt: string;
};

export type Draft = DraftFields & {
  id: string;
  author: string;
  status: DraftStatus;
  /** Set on publish; the unguessable slug is the capability to read it. */
  shareSlug: string | null;
  onchain: DraftOnchain | null;
  createdAt: string;
  updatedAt: string;
};

// GET /api/me/drafts — list view omits description, actions, author, onchain.
export type DraftSummary = {
  id: string;
  title: string;
  governorType: DraftGovernorType;
  status: DraftStatus;
  shareSlug: string | null;
  createdAt: string;
  updatedAt: string;
};

// POST /api/drafts/shared/:slug/submitted
export type DraftSubmission = {
  transactionHash: string;
  governorAddress: string;
  proposalId: string;
};

export type ElectionStatus = "upcoming" | "nominee" | "member" | "complete";

// `id` is `${governorAddress}:${proposalId}` — encode it before use in a path.
export type ElectionSummary = {
  id: string;
  cohort: number;
  status: ElectionStatus;
  startedAt: string;
  closedAt: string | null;
};

export type CandidateProfileFields = {
  name: string;
  title: string | null;
  twitter: string | null;
  type: string | null;
  representative: string | null;
  motivation: string | null;
  experience: string | null;
  skills: string[] | null;
  projects: string | null;
  country: string | null;
};

export type CandidateProfileVersion = CandidateProfileFields & {
  address: string;
  electionId: string;
  version: number;
  createdAt: string;
};

// GET /api/me/candidate-profile/:electionId. Versions are append-only, so
// `versions` is history metadata only — the field payload lives on `current`.
export type MyCandidateProfile = {
  current: CandidateProfileVersion | null;
  versions: { version: number; createdAt: string }[];
};
