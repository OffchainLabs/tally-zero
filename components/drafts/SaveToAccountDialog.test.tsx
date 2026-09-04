import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ProposalFormSnapshot } from "@/lib/drafts/mapping";

import { SaveToAccountDialog } from "./SaveToAccountDialog";

/**
 * Static first-render checks for the save button: whether it is enabled, what
 * it says, and why it is disabled. The dialog body and the save round trip need
 * a DOM and are covered end to end rather than here.
 */

const mocks = vi.hoisted(() => ({
  useSiwe: vi.fn(),
  useDraftMutations: vi.fn(),
}));

vi.mock("@/hooks/use-siwe", () => ({ useSiwe: mocks.useSiwe }));

vi.mock("@/hooks/use-drafts", () => ({
  useDraftMutations: mocks.useDraftMutations,
}));

const VALID_TARGET = "0x1111111111111111111111111111111111111111";

const snapshot = (
  overrides: Partial<ProposalFormSnapshot> = {}
): ProposalFormSnapshot => ({
  description: "A proposal body.",
  governorType: "treasury",
  actions: [{ target: "", value: "0", calldata: "0x" }],
  ...overrides,
});

// The trigger is the only button rendered while the dialog is closed.
const button = (markup: string) => markup.match(/<button[^>]*>/)?.[0] ?? "";

// The attribute, not Tailwind's `disabled:` variant classes on the same tag.
const isDisabled = (tag: string) => /\sdisabled=""/.test(tag);

describe("SaveToAccountDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useSiwe.mockReturnValue({ isSignedIn: true });
    mocks.useDraftMutations.mockReturnValue({
      createDraft: vi.fn(),
      patchDraft: vi.fn(),
      isCreating: false,
      isPatching: false,
    });
  });

  it("is disabled with a reason while signed out", () => {
    mocks.useSiwe.mockReturnValue({ isSignedIn: false });

    const markup = renderToStaticMarkup(
      <SaveToAccountDialog snapshot={snapshot()} />
    );

    expect(isDisabled(button(markup))).toBe(true);
    expect(button(markup)).toContain('title="Sign in to save drafts');
    expect(markup).not.toContain('data-testid="open-save-to-drafts"');
  });

  it("offers to save a new draft when not opened on one", () => {
    const markup = renderToStaticMarkup(
      <SaveToAccountDialog snapshot={snapshot()} />
    );

    expect(markup).toContain("Save to my drafts");
    expect(isDisabled(button(markup))).toBe(false);
  });

  it("offers to update when opened on an editable draft", () => {
    const markup = renderToStaticMarkup(
      <SaveToAccountDialog snapshot={snapshot()} draftId="d1" />
    );

    expect(markup).toContain("Update my draft");
    expect(markup).not.toContain("Save to my drafts");
  });

  it("offers to save a copy when opened on a frozen draft", () => {
    const markup = renderToStaticMarkup(
      <SaveToAccountDialog snapshot={snapshot()} draftId={null} saveAsNew />
    );

    expect(markup).toContain("Save as new draft");
    expect(markup).not.toContain("Update my draft");
  });

  // Once the first save has created the copy, the owner binds the dialog to it;
  // an id must win over any leftover saveAsNew so the next save is an update.
  it("offers to update once bound to a draft, whatever saveAsNew says", () => {
    const markup = renderToStaticMarkup(
      <SaveToAccountDialog snapshot={snapshot()} draftId="d2" saveAsNew />
    );

    expect(markup).toContain("Update my draft");
    expect(markup).not.toContain("Save as new draft");
  });

  // The blocker is the client-side stand-in for the API's 400s, surfaced as the
  // button's tooltip so the user learns why before a request is made.
  it("is disabled with the blocker as its tooltip when the API would reject", () => {
    const markup = renderToStaticMarkup(
      <SaveToAccountDialog snapshot={snapshot({ description: "  " })} />
    );

    expect(isDisabled(button(markup))).toBe(true);
    expect(button(markup)).toContain('title="Add a description');
  });

  it("is enabled for a description with only the blank placeholder row", () => {
    const markup = renderToStaticMarkup(
      <SaveToAccountDialog snapshot={snapshot()} />
    );

    expect(isDisabled(button(markup))).toBe(false);
    expect(button(markup)).not.toContain("title=");
  });

  it("is disabled for a half-filled action the API would reject", () => {
    const markup = renderToStaticMarkup(
      <SaveToAccountDialog
        snapshot={snapshot({
          actions: [{ target: "not-an-address", value: "0", calldata: "0x" }],
        })}
      />
    );

    expect(isDisabled(button(markup))).toBe(true);
    expect(button(markup)).toContain('title="Fix the errors in your actions');
  });

  it("is enabled for a fully valid action", () => {
    const markup = renderToStaticMarkup(
      <SaveToAccountDialog
        snapshot={snapshot({
          actions: [{ target: VALID_TARGET, value: "0", calldata: "0x" }],
        })}
      />
    );

    expect(isDisabled(button(markup))).toBe(false);
  });
});
