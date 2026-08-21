import { describe, expect, it } from "vitest";

import {
  addFocusArea,
  EMPTY_REGISTRATION_FORM,
  MAX_FOCUS_AREAS,
  toProfilePatch,
  toRegistrationForm,
  validateRegistrationForm,
  type DelegateRegistrationForm,
} from "./delegate-registration";

function form(
  overrides: Partial<DelegateRegistrationForm> = {}
): DelegateRegistrationForm {
  return { ...EMPTY_REGISTRATION_FORM, ...overrides };
}

const VALID = form({ name: "Delegate" });

describe("toRegistrationForm", () => {
  it("collapses nullable profile fields to empty strings", () => {
    expect(
      toRegistrationForm({
        name: null,
        bio: null,
        picture: null,
        twitter: null,
        discourseUsername: null,
        statement: null,
        isSeekingDelegation: null,
        issues: null,
      })
    ).toEqual(EMPTY_REGISTRATION_FORM);
  });

  it("returns the empty form when there is no profile yet", () => {
    expect(toRegistrationForm(undefined)).toEqual(EMPTY_REGISTRATION_FORM);
  });

  it("hydrates every editable field from a populated profile", () => {
    expect(
      toRegistrationForm({
        name: "Delegate",
        bio: "Bio",
        picture: "https://cdn.example/a.png",
        twitter: "handle",
        discourseUsername: "forum_user",
        statement: "# Statement",
        isSeekingDelegation: true,
        issues: ["Treasury"],
      })
    ).toEqual({
      name: "Delegate",
      bio: "Bio",
      twitter: "handle",
      discourseUsername: "forum_user",
      statement: "# Statement",
      isSeekingDelegation: true,
      focusAreas: ["Treasury"],
    });
  });

  it("leaves the avatar out of the form, since the upload route owns it", () => {
    expect(
      toRegistrationForm({ picture: "https://cdn.example/a.png" })
    ).not.toHaveProperty("picture");
  });
});

describe("validateRegistrationForm", () => {
  it("accepts a form with a display name", () => {
    expect(validateRegistrationForm(VALID)).toEqual({});
  });

  it("requires a display name", () => {
    expect(validateRegistrationForm(form())).toHaveProperty("name");
  });

  it("treats a whitespace-only name as missing", () => {
    expect(validateRegistrationForm(form({ name: "  " })).name).toBeDefined();
  });

  it("does not require an avatar, which needs voting power to upload", () => {
    expect(validateRegistrationForm(VALID)).not.toHaveProperty("picture");
  });
});

describe("toProfilePatch", () => {
  it("sends null for cleared strings so the indexer falls back to its seed", () => {
    const patch = toProfilePatch(VALID);
    expect(patch.bio).toBeNull();
    expect(patch.twitter).toBeNull();
    expect(patch.statement).toBeNull();
    expect(patch.issues).toBeNull();
  });

  it("never writes the avatar, which the upload route already committed", () => {
    expect(toProfilePatch(VALID)).not.toHaveProperty("picture");
  });

  it("trims values it does send", () => {
    const patch = toProfilePatch(form({ name: "  Delegate  " }));
    expect(patch.name).toBe("Delegate");
  });

  it("carries focus areas through as issues", () => {
    const patch = toProfilePatch({
      ...VALID,
      focusAreas: ["Treasury", "Grants"],
    });
    expect(patch.issues).toEqual(["Treasury", "Grants"]);
  });

  it("always sends the seeking-delegation flag, including when false", () => {
    expect(toProfilePatch(VALID).isSeekingDelegation).toBe(false);
    expect(
      toProfilePatch({ ...VALID, isSeekingDelegation: true })
        .isSeekingDelegation
    ).toBe(true);
  });
});

describe("addFocusArea", () => {
  it("appends a trimmed value", () => {
    expect(addFocusArea([], "  Treasury  ")).toEqual(["Treasury"]);
  });

  it("ignores blank input", () => {
    expect(addFocusArea(["Treasury"], "   ")).toEqual(["Treasury"]);
  });

  it("ignores case-insensitive duplicates", () => {
    expect(addFocusArea(["Treasury"], "treasury")).toEqual(["Treasury"]);
  });

  it(`caps the list at ${MAX_FOCUS_AREAS}`, () => {
    const full = ["Treasury", "Security", "Grants"];
    expect(full).toHaveLength(MAX_FOCUS_AREAS);
    expect(addFocusArea(full, "Growth")).toEqual(full);
  });

  it("never mutates or returns the input array", () => {
    const existing = ["Treasury"];
    expect(addFocusArea(existing, "Grants")).not.toBe(existing);
    expect(addFocusArea(existing, "   ")).not.toBe(existing);
    expect(existing).toEqual(["Treasury"]);
  });
});
