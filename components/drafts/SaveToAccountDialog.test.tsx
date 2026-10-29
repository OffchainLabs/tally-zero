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
  useProposalEligibility: vi.fn(),
}));

vi.mock("@/hooks/use-siwe", () => ({ useSiwe: mocks.useSiwe }));

vi.mock("@/hooks/use-proposal-eligibility", () => ({
  useProposalEligibility: mocks.useProposalEligibility,
}));

vi.mock("@/hooks/use-drafts", () => ({
  useDraftMutations: mocks.useDraftMutations,
}));

const VALID_TARGET = "0x1111111111111111111111111111111111111111";
const SIGNER = "0x3333333333333333333333333333333333333333";
const SAFE = "0x2222222222222222222222222222222222222222";
const THRESHOLD = BigInt(1_000_000) * BigInt(10) ** BigInt(18);

const snapshot = (
  overrides: Partial<ProposalFormSnapshot> = {}
): ProposalFormSnapshot => ({
  description: "A proposal body.",
  governorType: "treasury",
  actions: [{ chain: "arb1", target: "", value: "0", calldata: "0x" }],
  ...overrides,
});

// The trigger is the only button rendered while the dialog is closed.
const button = (markup: string) => markup.match(/<button[^>]*>/)?.[0] ?? "";

// The attribute, not Tailwind's `disabled:` variant classes on the same tag.
const isDisabled = (tag: string) => /\sdisabled=""/.test(tag);

describe("SaveToAccountDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useSiwe.mockReturnValue({
      isSignedIn: true,
      effectiveAddress: SIGNER,
    });
    mocks.useProposalEligibility.mockReturnValue({ eligibility: "meets" });
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
          actions: [
            {
              chain: "arb1",
              target: "not-an-address",
              value: "0",
              calldata: "0x",
            },
          ],
        })}
      />
    );

    expect(isDisabled(button(markup))).toBe(true);
    expect(button(markup)).toContain('title="Fix the errors in your actions');
  });

  // Drafts belong to the SIWE subject, so that is the address whose voting
  // power is measured. The tooltip is this button's only explanation, so it
  // names the amount.
  it("is disabled with the threshold as its tooltip for a subject below it", () => {
    mocks.useProposalEligibility.mockReturnValue({
      eligibility: "below",
      proposalThreshold: THRESHOLD,
    });

    const markup = renderToStaticMarkup(
      <SaveToAccountDialog snapshot={snapshot()} draftId="d1" />
    );

    expect(isDisabled(button(markup))).toBe(true);
    expect(button(markup)).toContain(
      'title="Saving a draft requires voting power at or above the Treasury Governor proposal threshold of 1M ARB."'
    );
    expect(mocks.useProposalEligibility).toHaveBeenCalledWith("treasury", {
      address: SIGNER,
    });
  });

  it("measures the Safe being acted as, not the signer", () => {
    mocks.useSiwe.mockReturnValue({ isSignedIn: true, effectiveAddress: SAFE });

    renderToStaticMarkup(<SaveToAccountDialog snapshot={snapshot()} />);

    expect(mocks.useProposalEligibility).toHaveBeenCalledWith("treasury", {
      address: SAFE,
    });
  });

  it("is disabled while eligibility is still being read", () => {
    mocks.useProposalEligibility.mockReturnValue({ eligibility: "unknown" });

    const markup = renderToStaticMarkup(
      <SaveToAccountDialog snapshot={snapshot()} />
    );

    expect(isDisabled(button(markup))).toBe(true);
    expect(button(markup)).toContain('title="Checking your voting power');
  });

  // A failed read never resolves on its own, so "checking" would be a lie.
  it("is disabled with the failed read as its tooltip", () => {
    mocks.useProposalEligibility.mockReturnValue({
      eligibility: "unknown",
      isError: true,
    });

    const markup = renderToStaticMarkup(
      <SaveToAccountDialog snapshot={snapshot()} />
    );

    expect(isDisabled(button(markup))).toBe(true);
    expect(button(markup)).toContain(
      'title="Could not check your voting power against the Treasury Governor proposal threshold. Check your RPC in Settings and try again."'
    );
    expect(button(markup)).not.toContain("Checking your voting power");
  });

  it("names the contents problem before the threshold", () => {
    mocks.useProposalEligibility.mockReturnValue({ eligibility: "below" });

    const markup = renderToStaticMarkup(
      <SaveToAccountDialog snapshot={snapshot({ description: "  " })} />
    );

    expect(button(markup)).toContain('title="Add a description');
  });

  it("is enabled for a fully valid action", () => {
    const markup = renderToStaticMarkup(
      <SaveToAccountDialog
        snapshot={snapshot({
          actions: [
            { chain: "arb1", target: VALID_TARGET, value: "0", calldata: "0x" },
          ],
        })}
      />
    );

    expect(isDisabled(button(markup))).toBe(false);
  });
});
