import { describe, expect, it } from "vitest";

import type { Draft } from "@/lib/siwe/types";
import {
  deriveDraftTitle,
  DRAFT_TITLE_MAX_LENGTH,
  draftToFormState,
  fromDraftGovernorType,
  getDraftBlocker,
  toDraftFields,
  toDraftGovernorType,
} from "./mapping";

const VALID_TARGET = "0x1111111111111111111111111111111111111111";

const formState = (
  overrides: Partial<Parameters<typeof toDraftFields>[0]>
) => ({
  title: "",
  description: "A proposal body.",
  governorType: "treasury" as const,
  actions: [{ target: "", value: "0", calldata: "0x" }],
  ...overrides,
});

describe("governor type mapping", () => {
  it("round-trips both governors", () => {
    for (const type of ["core", "treasury"] as const) {
      expect(fromDraftGovernorType(toDraftGovernorType(type))).toBe(type);
    }
  });
});

describe("deriveDraftTitle", () => {
  it("prefers the markdown H1", () => {
    expect(deriveDraftTitle("intro\n\n# The real title\n\nbody")).toBe(
      "The real title"
    );
  });

  it("falls back to the first non-empty line", () => {
    expect(deriveDraftTitle("\n\n  first words  \nsecond line")).toBe(
      "first words"
    );
  });

  // The API rejects an empty title with a 400, so this can never return "".
  it("never returns an empty title", () => {
    for (const input of ["", "   ", "\n\n", "#", "##  "]) {
      expect(deriveDraftTitle(input)).not.toBe("");
    }
  });

  // "#hashtag" is not a heading; "# heading" is. The regex requires the space.
  it("does not treat a bare hash as a heading", () => {
    expect(deriveDraftTitle("#hashtag opener")).toBe("#hashtag opener");
  });

  it("truncates a runaway first line", () => {
    const title = deriveDraftTitle("x".repeat(500));
    expect(title.length).toBe(DRAFT_TITLE_MAX_LENGTH);
  });
});

describe("getDraftBlocker", () => {
  // Looser than the form's own validity check on purpose: saving a proposal
  // that has no actions yet is the main reason to save a draft at all.
  it("allows a description with only the blank placeholder action", () => {
    expect(getDraftBlocker(formState({}))).toBeNull();
  });

  it("requires a description", () => {
    expect(getDraftBlocker(formState({ description: "  " }))).toMatch(
      /description/
    );
  });

  it("rejects a half-filled action the API would 400 on", () => {
    const blocker = getDraftBlocker(
      formState({
        actions: [{ target: "not-an-address", value: "0", calldata: "0x" }],
      })
    );
    expect(blocker).toMatch(/actions/);
  });
});

describe("toDraftFields", () => {
  // The form's initial state is one blank action row. Posting it verbatim fails
  // requireAddress on the server, so blank rows must not survive the mapping.
  it("drops blank placeholder actions", () => {
    expect(toDraftFields(formState({})).actions).toEqual([]);
  });

  it("keeps a filled action and normalizes empty calldata to 0x", () => {
    const fields = toDraftFields(
      formState({
        actions: [{ target: VALID_TARGET, value: "", calldata: "" }],
      })
    );

    expect(fields.actions).toEqual([
      { target: VALID_TARGET, value: "0", calldata: "0x" },
    ]);
  });

  it("derives the title when the user left it blank", () => {
    expect(toDraftFields(formState({ description: "# Named" })).title).toBe(
      "Named"
    );
  });

  it("prefers an explicit title", () => {
    expect(
      toDraftFields(formState({ title: " Mine ", description: "# Named" }))
        .title
    ).toBe("Mine");
  });
});

describe("draftToFormState", () => {
  const draft = (overrides: Partial<Draft> = {}): Draft => ({
    id: "d1",
    author: "0xauthor",
    title: "Stored",
    description: "body",
    governorType: "CONSTITUTIONAL",
    actions: [],
    status: "draft",
    shareSlug: null,
    onchain: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  });

  // The form maps over actions to render rows, so an empty list would leave the
  // user with nothing to type into.
  it("restores an actionless draft as one blank row", () => {
    const state = draftToFormState(draft());
    expect(state.actions).toHaveLength(1);
    expect(state.actions[0]).toMatchObject({ target: "", calldata: "0x" });
  });

  it("gives every restored action a distinct form id", () => {
    const state = draftToFormState(
      draft({
        actions: [
          { target: VALID_TARGET, value: "1", calldata: "0x" },
          { target: VALID_TARGET, value: "2", calldata: "0x" },
        ],
      })
    );

    expect(new Set(state.actions.map((a) => a.id)).size).toBe(2);
  });

  it("maps the governor back to the form's naming", () => {
    expect(draftToFormState(draft()).governorType).toBe("core");
  });
});
