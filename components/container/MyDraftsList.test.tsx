import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DraftSummary } from "@/lib/siwe/types";

import MyDraftsList from "./MyDraftsList";

/**
 * Static first-render checks for the "My Drafts" tab: which of its states shows
 * for each combination of session and list query, and where each row links.
 */

const mocks = vi.hoisted(() => ({
  useSiwe: vi.fn(),
  useDraftsList: vi.fn(),
}));

vi.mock("@/hooks/use-siwe", () => ({ useSiwe: mocks.useSiwe }));

vi.mock("@/hooks/use-drafts", () => ({
  useDraftsList: mocks.useDraftsList,
}));

const DRAFT: DraftSummary = {
  id: "d1",
  title: "Fund documentation bounties",
  governorType: "TREASURY",
  status: "draft",
  shareSlug: null,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-02T00:00:00Z",
};

function session(overrides: Partial<ReturnType<typeof mocks.useSiwe>> = {}) {
  mocks.useSiwe.mockReturnValue({
    isSignedIn: true,
    isLoadingSession: false,
    ...overrides,
  });
}

function list(
  overrides: Partial<{
    drafts: DraftSummary[];
    isLoading: boolean;
    error: Error | null;
  }> = {}
) {
  mocks.useDraftsList.mockReturnValue({
    drafts: [],
    isLoading: false,
    error: null,
    ...overrides,
  });
}

const render = () => renderToStaticMarkup(<MyDraftsList />);

describe("MyDraftsList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    session();
    list();
  });

  it("shows a placeholder while the session resolves", () => {
    session({ isSignedIn: false, isLoadingSession: true });

    expect(render()).toContain('data-testid="drafts-loading"');
  });

  it("asks a signed-out visitor to sign in instead of showing an empty list", () => {
    session({ isSignedIn: false });

    const markup = render();

    expect(markup).toContain("Sign in to see your drafts");
    expect(markup).not.toContain("No drafts yet");
  });

  it("shows a placeholder while the list loads", () => {
    list({ isLoading: true });

    expect(render()).toContain('data-testid="drafts-loading"');
  });

  it("surfaces the list error", () => {
    list({ error: new Error("upstream unavailable") });

    expect(render()).toContain("upstream unavailable");
  });

  it("shows the empty state when the account has no drafts", () => {
    expect(render()).toContain("No drafts yet");
  });

  it("links each draft to the form, newest first", () => {
    list({
      drafts: [
        DRAFT,
        {
          ...DRAFT,
          id: "d2",
          title: "Newer",
          updatedAt: "2026-03-01T00:00:00Z",
        },
      ],
    });

    const markup = render();

    expect(markup).toContain('href="/proposal/new?draft=d1"');
    expect(markup).toContain('href="/proposal/new?draft=d2"');
    expect(markup.indexOf("Newer")).toBeLessThan(
      markup.indexOf("Fund documentation bounties")
    );
    expect(markup).toContain("Treasury");
    expect(markup).toContain("Continue editing");
  });

  // Published and submitted drafts are frozen on the server; the loader opens
  // them as a copy, and the row should not promise an in-place edit.
  it.each(["published", "submitted"] as const)(
    "labels a %s draft as opening a copy",
    (status) => {
      list({ drafts: [{ ...DRAFT, status }] });

      const markup = render();

      expect(markup).toContain("Open as copy");
      expect(markup).not.toContain("Continue editing");
    }
  );
});
