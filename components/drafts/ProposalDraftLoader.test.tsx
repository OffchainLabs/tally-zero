import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Draft } from "@/lib/siwe/types";

import { ProposalDraftLoader } from "./ProposalDraftLoader";

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
  useSiwe: vi.fn(),
  useDraft: vi.fn(),
  form: vi.fn(),
  dialog: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => mocks.searchParams,
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

function session(overrides: Partial<ReturnType<typeof mocks.useSiwe>> = {}) {
  mocks.useSiwe.mockReturnValue({
    isSignedIn: false,
    isLoadingSession: false,
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
    expect(mocks.form.mock.calls[0][0]).toMatchObject({ initialDraft: null });
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
      expect(mocks.form.mock.calls[0][0]).toMatchObject({
        initialDraft: { title: "Stored" },
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
