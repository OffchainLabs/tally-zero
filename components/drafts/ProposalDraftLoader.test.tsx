import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Draft } from "@/lib/siwe/types";

import {
  type LastSaved,
  ProposalDraftLoader,
  resolveDraftBinding,
  saveAppliesTo,
} from "./ProposalDraftLoader";

/**
 * The loader decides, per render, whether the proposal form is mounted. That
 * decision matters more than usual because CreateProposalForm seeds its state
 * from `initialDraft` on mount only, and its mount effect restores the
 * localStorage autosave when no draft was given. Mounting it too early means a
 * blank form, a restore, an unmount for the skeleton, and a second mount on the
 * draft. These tests pin the first-render decision for each session state.
 */

const mocks = vi.hoisted(() => ({
  searchParams: new URLSearchParams(),
  replace: vi.fn(),
  useSiwe: vi.fn(),
  useDraft: vi.fn(),
  form: vi.fn(),
  dialog: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => mocks.searchParams,
  usePathname: () => "/proposal/new",
  useRouter: () => ({ replace: mocks.replace }),
}));

vi.mock("@/hooks/use-siwe", () => ({ useSiwe: mocks.useSiwe }));

vi.mock("@/hooks/use-drafts", () => ({ useDraft: mocks.useDraft }));

// The dialog pulls in the drafts hooks and the SIWE session; none of that is
// under test here. Only what the loader hands it is.
vi.mock("@/components/drafts/SaveToAccountDialog", () => ({
  SaveToAccountDialog: (props: unknown) => {
    mocks.dialog(props);
    return null;
  },
}));

// Record what the loader hands the form instead of rendering the real thing,
// and render the render prop's output the way the real form's submit row would,
// so the (mocked) dialog sees its props.
vi.mock("@/components/form/CreateProposalForm", () => ({
  default: (props: {
    renderDraftActions?: (snapshot: unknown) => ReactNode;
  }) => {
    mocks.form(props);
    return (
      <div data-testid="form">
        {props.renderDraftActions?.({
          description: "",
          governorType: "treasury",
          actions: [],
        })}
      </div>
    );
  },
}));

const DRAFT: Draft = {
  id: "d1",
  author: "0xauthor",
  title: "Stored",
  description: "# Stored\n\nbody",
  governorType: "TREASURY",
  actions: [],
  status: "draft",
  shareSlug: null,
  onchain: null,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

const SUBJECT = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd";

function session(overrides: Partial<ReturnType<typeof mocks.useSiwe>> = {}) {
  mocks.useSiwe.mockReturnValue({
    isSignedIn: false,
    isLoadingSession: false,
    effectiveAddress: overrides.isSignedIn ? SUBJECT : null,
    ...overrides,
  });
}

function draftQuery(
  overrides: Partial<{
    data: Draft | undefined;
    isLoading: boolean;
    error: Error | null;
  }> = {}
) {
  mocks.useDraft.mockReturnValue({
    data: undefined,
    isLoading: false,
    error: null,
    ...overrides,
  });
}

const render = () => renderToStaticMarkup(<ProposalDraftLoader />);

describe("ProposalDraftLoader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.searchParams = new URLSearchParams("draft=d1");
    session();
    draftQuery();
  });

  it("mounts the plain form once when there is no ?draft=", () => {
    mocks.searchParams = new URLSearchParams();
    session({ isLoadingSession: true });

    expect(render()).toContain('data-testid="form"');
    expect(mocks.form).toHaveBeenCalledTimes(1);
    expect(mocks.form.mock.calls[0][0]).toMatchObject({
      initialDraft: null,
      draftId: null,
      serverSave: null,
    });
  });

  // The form picks its autosave slot from draftId and names the subject in its
  // status bar, so both have to arrive alongside the draft.
  it("hands the form the bound draft id and the signed-in subject", () => {
    session({ isSignedIn: true });
    draftQuery({ data: DRAFT });

    render();

    expect(mocks.form.mock.calls[0][0]).toMatchObject({
      draftId: "d1",
      serverSave: null,
      accountAddress: SUBJECT,
    });
  });

  // useDraft stands down with skipToken until the subject is known, and a
  // skipped query is pending but not fetching, so its isLoading is false. The
  // loader must not read that as "resolved".
  it("does not mount the form while the session is still resolving", () => {
    session({ isLoadingSession: true });
    draftQuery({ isLoading: false });

    expect(render()).not.toContain('data-testid="form"');
    expect(mocks.form).not.toHaveBeenCalled();
  });

  it("does not mount the form while the draft is fetching", () => {
    session({ isSignedIn: true });
    draftQuery({ isLoading: true });

    expect(render()).not.toContain('data-testid="form"');
    expect(mocks.form).not.toHaveBeenCalled();
  });

  it("mounts the form on the draft once it has loaded", () => {
    session({ isSignedIn: true });
    draftQuery({ data: DRAFT });

    expect(render()).toContain('data-testid="form"');
    expect(mocks.form).toHaveBeenCalledTimes(1);
    expect(mocks.form.mock.calls[0][0]).toMatchObject({
      initialDraft: {
        title: "Stored",
        description: "# Stored\n\nbody",
        governorType: "treasury",
      },
    });
  });

  it("points the save dialog at an editable draft so saving updates it", () => {
    session({ isSignedIn: true });
    draftQuery({ data: DRAFT });

    const markup = render();

    expect(markup).not.toContain("can no longer be edited");
    expect(mocks.dialog.mock.calls[0][0]).toMatchObject({
      draftId: "d1",
      initialTitle: "Stored",
      saveAsNew: false,
    });
  });

  // PATCH answers 409 not_editable once a draft is published, so the user must
  // learn that before typing, and saving has to create a copy instead.
  it.each(["published", "submitted"] as const)(
    "opens a %s draft as a copy rather than an update",
    (status) => {
      session({ isSignedIn: true });
      draftQuery({ data: { ...DRAFT, status } });

      const markup = render();

      expect(markup).toContain(`This draft has been ${status}`);
      // Unbound for the dialog, but the autosave slot is still this draft's:
      // sharing the bare key would restore or delete the anonymous form's copy.
      expect(mocks.form.mock.calls[0][0]).toMatchObject({
        initialDraft: { title: "Stored" },
        draftId: "d1",
      });
      expect(mocks.dialog.mock.calls[0][0]).toMatchObject({
        draftId: null,
        initialTitle: "Stored (copy)",
        saveAsNew: true,
      });
    }
  );

  it("explains and falls back to a blank form when signed out", () => {
    session({ isSignedIn: false });

    const markup = render();

    expect(markup).toContain("Sign in to open a saved draft.");
    expect(markup).toContain('data-testid="form"');
    expect(mocks.form.mock.calls[0][0]).toMatchObject({ initialDraft: null });
  });

  it("explains and falls back to a blank form when the draft fails to load", () => {
    session({ isSignedIn: true });
    draftQuery({ error: new Error("404") });

    const markup = render();

    expect(markup).toContain("That draft could not be loaded");
    expect(markup).toContain('data-testid="form"');
    expect(mocks.form.mock.calls[0][0]).toMatchObject({ initialDraft: null });
  });
});

// The binding after a save is state the static renders above cannot reach, so
// the derivation is pinned on its own. The API has no uniqueness rule on titles,
// so a second create would not fail: it would silently add another copy. Binding
// to the saved draft is what turns the second save into an update.
describe("resolveDraftBinding", () => {
  const COPY: Draft = { ...DRAFT, id: "d2", title: "Stored (copy)" };

  it("binds a blank form to nothing until the first save", () => {
    expect(resolveDraftBinding(undefined, null)).toEqual({
      isEditable: true,
      draftId: null,
      initialTitle: undefined,
      saveAsNew: false,
    });
  });

  it("binds a blank form to the draft its first save created", () => {
    expect(resolveDraftBinding(undefined, COPY)).toMatchObject({
      draftId: "d2",
      initialTitle: "Stored (copy)",
      saveAsNew: false,
    });
  });

  it("prefers the saved record of an editable draft, which may have been renamed", () => {
    const renamed: Draft = { ...DRAFT, title: "Renamed" };

    expect(resolveDraftBinding(DRAFT, renamed)).toMatchObject({
      isEditable: true,
      draftId: "d1",
      initialTitle: "Renamed",
    });
  });

  it.each(["published", "submitted"] as const)(
    "binds a %s draft to its copy once that copy exists",
    (status) => {
      const frozen: Draft = { ...DRAFT, status };

      expect(resolveDraftBinding(frozen, null)).toEqual({
        isEditable: false,
        draftId: null,
        initialTitle: "Stored (copy)",
        saveAsNew: true,
      });
      expect(resolveDraftBinding(frozen, COPY)).toEqual({
        isEditable: false,
        draftId: "d2",
        initialTitle: "Stored (copy)",
        saveAsNew: false,
      });
    }
  );
});

// Which renders a save answers for. The URL moves to the saved draft after a
// create, and there is a render or two before it lands where ?draft= still says
// what it said at save time; the save has to apply across that gap and stop
// applying to a bare /proposal/new afterwards.
describe("saveAppliesTo", () => {
  const save = (overrides: Partial<LastSaved> = {}): LastSaved => ({
    openedOn: null,
    draft: { ...DRAFT, id: "d9" },
    serverSave: {
      at: 0,
      address: SUBJECT,
      snapshot: { description: "", governorType: "treasury", actions: [] },
    },
    moved: false,
    ...overrides,
  });

  it("applies to nothing before any save", () => {
    expect(saveAppliesTo(null, null)).toBe(false);
    expect(saveAppliesTo(null, "d1")).toBe(false);
  });

  it("applies while the URL still says what it said at save time", () => {
    expect(saveAppliesTo(save(), null)).toBe(true);
    expect(saveAppliesTo(save({ openedOn: "d1" }), "d1")).toBe(true);
  });

  it("applies once the URL has moved to the saved draft, and keeps applying", () => {
    expect(saveAppliesTo(save(), "d9")).toBe(true);
    expect(saveAppliesTo(save({ moved: true }), "d9")).toBe(true);
  });

  it("stops answering for the blank form once the URL has moved", () => {
    expect(saveAppliesTo(save({ moved: true }), null)).toBe(false);
    expect(saveAppliesTo(save({ openedOn: "d1", moved: true }), "d1")).toBe(
      false
    );
  });

  it("never applies to an unrelated draft", () => {
    expect(saveAppliesTo(save(), "d2")).toBe(false);
    expect(saveAppliesTo(save({ openedOn: "d1" }), "d2")).toBe(false);
  });
});
