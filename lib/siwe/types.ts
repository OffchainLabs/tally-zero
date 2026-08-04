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

// GET /api/me
export type MeResponse = {
  address: string;
  actingAs: string | null;
  effectiveAddress: string;
  profile: ResolvedProfile;
  ownedFields: string[];
  safes: unknown[];
};

// PATCH /api/me/profile
export type ProfilePatchResult = {
  owned: Partial<ProfileFields>;
  resolved: ResolvedProfile;
};
