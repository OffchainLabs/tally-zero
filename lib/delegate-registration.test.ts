import { describe, expect, it } from "vitest";

import {
  addFocusArea,
  EMPTY_REGISTRATION_FORM,
  MAX_FOCUS_AREAS,
  removeFocusArea,
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

const VALID = form({ picture: "https://cdn.example/a.png", name: "Delegate" });

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

  it("hydrates every field from a populated profile", () => {
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
      picture: "https://cdn.example/a.png",
      twitter: "handle",
      discourseUsername: "forum_user",
      statement: "# Statement",
      isSeekingDelegation: true,
      focusAreas: ["Treasury"],
    });
  });
});

describe("validateRegistrationForm", () => {
  it("accepts a form with an avatar and a display name", () => {
    expect(validateRegistrationForm(VALID)).toEqual({});
  });

  it("requires an avatar", () => {
    expect(validateRegistrationForm(form({ name: "Delegate" }))).toHaveProperty(
      "picture"
    );
  });

  it("requires a display name", () => {
    expect(
      validateRegistrationForm(form({ picture: "https://cdn.example/a.png" }))
    ).toHaveProperty("name");
  });

  it("treats whitespace-only values as missing", () => {
    const errors = validateRegistrationForm(
      form({ picture: "   ", name: "  " })
    );
    expect(errors.picture).toBeDefined();
    expect(errors.name).toBeDefined();
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
    const existing = ["Treasury"];
    expect(addFocusArea(existing, "   ")).toBe(existing);
  });

  it("ignores case-insensitive duplicates", () => {
    const existing = ["Treasury"];
    expect(addFocusArea(existing, "treasury")).toBe(existing);
  });

  it(`caps the list at ${MAX_FOCUS_AREAS}`, () => {
    const full = ["Treasury", "Security", "Grants"];
    expect(full).toHaveLength(MAX_FOCUS_AREAS);
    expect(addFocusArea(full, "Growth")).toBe(full);
  });
});

describe("removeFocusArea", () => {
  it("drops the matching entry and leaves the rest", () => {
    expect(removeFocusArea(["Treasury", "Grants"], "Treasury")).toEqual([
      "Grants",
    ]);
  });

  it("is a no-op for an unknown value", () => {
    expect(removeFocusArea(["Treasury"], "Grants")).toEqual(["Treasury"]);
  });
});
