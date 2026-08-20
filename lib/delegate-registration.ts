import type { ProfileFields } from "@/lib/siwe/types";

/** Focus areas a delegate may pick, per the registration design. */
export const MAX_FOCUS_AREAS = 3;

/**
 * The editable form. `picture` is deliberately absent: the avatar upload route
 * commits it server-side, so the form reads it from the session rather than
 * holding a second, divergent copy.
 */
export type DelegateRegistrationForm = {
  name: string;
  twitter: string;
  discourseUsername: string;
  bio: string;
  statement: string;
  focusAreas: string[];
  isSeekingDelegation: boolean;
};

export const EMPTY_REGISTRATION_FORM: DelegateRegistrationForm = {
  name: "",
  twitter: "",
  discourseUsername: "",
  bio: "",
  statement: "",
  focusAreas: [],
  isSeekingDelegation: false,
};

export type RegistrationErrors = Partial<Record<"name", string>>;

/**
 * Hydrate the form from a resolved profile. Nullable indexer fields collapse to
 * empty strings so every input stays controlled.
 */
export function toRegistrationForm(
  profile: Partial<ProfileFields> | undefined
): DelegateRegistrationForm {
  return {
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
 * Client-side validation. Only the display name is required: an avatar cannot
 * be, because uploading one requires delegated voting power the registrant may
 * not have yet.
 */
export function validateRegistrationForm(
  form: DelegateRegistrationForm
): RegistrationErrors {
  const errors: RegistrationErrors = {};
  if (form.name.trim() === "") {
    errors.name = "Display name is required.";
  }
  return errors;
}

/**
 * Append a focus area, ignoring blanks, case-insensitive duplicates, and
 * anything beyond the cap.
 */
export function addFocusArea(focusAreas: string[], value: string): string[] {
  const trimmed = value.trim();
  if (trimmed === "") return [...focusAreas];
  if (focusAreas.length >= MAX_FOCUS_AREAS) return [...focusAreas];

  const exists = focusAreas.some(
    (area) => area.toLowerCase() === trimmed.toLowerCase()
  );
  if (exists) return [...focusAreas];

  return [...focusAreas, trimmed];
}
