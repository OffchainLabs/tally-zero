// Profile contract consumed by this UI. Keep the session response below as a
// narrow projection instead of mirroring unrelated indexer fields.
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
  profile: ResolvedProfile;
};

// PATCH /api/me/profile
export type ProfilePatchResult = {
  owned: Partial<ProfileFields>;
  resolved: ResolvedProfile;
};
