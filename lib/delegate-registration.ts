import type { ProfileFields } from "@/lib/siwe/types";

/** Focus areas a delegate may pick, per the registration design. */
export const MAX_FOCUS_AREAS = 3;

export type DelegateRegistrationForm = {
  picture: string;
  name: string;
  twitter: string;
  discourseUsername: string;
  bio: string;
  statement: string;
  focusAreas: string[];
  isSeekingDelegation: boolean;
};

export const EMPTY_REGISTRATION_FORM: DelegateRegistrationForm = {
  picture: "",
  name: "",
  twitter: "",
  discourseUsername: "",
  bio: "",
  statement: "",
  focusAreas: [],
  isSeekingDelegation: false,
};

export type RegistrationErrors = Partial<Record<"picture" | "name", string>>;

/**
 * Hydrate the form from a resolved profile. Nullable indexer fields collapse to
 * empty strings so every input stays controlled.
 */
export function toRegistrationForm(
  profile: Partial<ProfileFields> | undefined
): DelegateRegistrationForm {
  return {
    picture: profile?.picture ?? "",
    name: profile?.name ?? "",
    twitter: profile?.twitter ?? "",
    discourseUsername: profile?.discourseUsername ?? "",
    bio: profile?.bio ?? "",
    statement: profile?.statement ?? "",
    focusAreas: profile?.issues ?? [],
    isSeekingDelegation: profile?.isSeekingDelegation ?? false,
  };
}

/**
 * Build the PATCH payload. Cleared strings are sent as `null` so the indexer
 * falls back to its seed value rather than persisting an empty override.
 */
export function toProfilePatch(
  form: DelegateRegistrationForm
): Partial<ProfileFields> {
  const str = (value: string) => {
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
  };

  return {
    picture: str(form.picture),
    name: str(form.name),
    twitter: str(form.twitter),
    discourseUsername: str(form.discourseUsername),
    bio: str(form.bio),
    statement: str(form.statement),
    issues: form.focusAreas.length > 0 ? form.focusAreas : null,
    isSeekingDelegation: form.isSeekingDelegation,
  };
}

/**
 * Client-side validation for the two fields the design marks required.
 * `ProfileFields` types both as nullable, so the `*` markers are only
 * enforced here.
 */
export function validateRegistrationForm(
  form: DelegateRegistrationForm
): RegistrationErrors {
  const errors: RegistrationErrors = {};

  if (form.picture.trim() === "") {
    errors.picture = "Upload an avatar.";
  }
  if (form.name.trim() === "") {
    errors.name = "Display name is required.";
  }
  return errors;
}

export function isRegistrationValid(form: DelegateRegistrationForm): boolean {
  return Object.keys(validateRegistrationForm(form)).length === 0;
}

/**
 * Append a focus area, ignoring blanks, case-insensitive duplicates, and
 * anything beyond the cap. Returns the original array when nothing changes so
 * callers can skip a re-render.
 */
export function addFocusArea(focusAreas: string[], value: string): string[] {
  const trimmed = value.trim();
  if (trimmed === "") return focusAreas;
  if (focusAreas.length >= MAX_FOCUS_AREAS) return focusAreas;

  const exists = focusAreas.some(
    (area) => area.toLowerCase() === trimmed.toLowerCase()
  );
  if (exists) return focusAreas;

  return [...focusAreas, trimmed];
}

export function removeFocusArea(focusAreas: string[], value: string): string[] {
  return focusAreas.filter((area) => area !== value);
}
