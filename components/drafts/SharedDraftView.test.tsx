// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SiweApiError } from "@/lib/siwe/client";
import type { Draft } from "@/lib/siwe/types";

import { SharedDraftView } from "./SharedDraftView";

/**
 * The public shared-draft page, rendered under jsdom. The markdown pipeline runs
 * for real, because its plugin ordering is the one security property this page
 * has and a mock would assert nothing about it. The data hooks and the session
 * are mocked at the module boundary.
 */

const mocks = vi.hoisted(() => ({
  useSiwe: vi.fn(),
  useSharedDraft: vi.fn(),
}));

vi.mock("@/hooks/use-siwe", () => ({ useSiwe: mocks.useSiwe }));
vi.mock("@/hooks/use-drafts", () => ({
  useSharedDraft: mocks.useSharedDraft,
}));

const AUTHOR = "0x1111111111111111111111111111111111111111";
const GOVERNOR = "0x3333333333333333333333333333333333333333";
const TX = `0x${"ab".repeat(32)}`;

const draft = (overrides: Partial<Draft> = {}): Draft => ({
  id: "d1",
  author: AUTHOR,
  title: "Fund the thing",
  description: "A **bold** plan.",
  governorType: "TREASURY",
  actions: [],
  status: "published",
  shareSlug: "abc123",
  onchain: null,
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-02T00:00:00.000Z",
  ...overrides,
});

const loaded = (value: Draft) =>
  mocks.useSharedDraft.mockReturnValue({
    data: value,
    isLoading: false,
    error: null,
  });

const failed = (error: Error) =>
  mocks.useSharedDraft.mockReturnValue({
    data: undefined,
    isLoading: false,
    error,
  });

const signedIn = () =>
  mocks.useSiwe.mockReturnValue({
    isConnected: true,
    isSignedIn: true,
    effectiveAddress: AUTHOR,
    signIn: vi.fn(),
    isSigningIn: false,
    signInError: null,
  });

describe("SharedDraftView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signedIn();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("shows a skeleton while loading", () => {
    mocks.useSharedDraft.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    });

    const { queryByTestId } = render(<SharedDraftView slug="abc123" />);

    expect(queryByTestId("shared-draft-title")).toBeNull();
    expect(queryByTestId("shared-draft-error")).toBeNull();
  });

  it("calls a 404 an invalid link", () => {
    const logError = vi.spyOn(console, "error").mockImplementation(() => {});
    failed(new SiweApiError(404, "not_found", "Draft not found."));

    const { getByTestId } = render(<SharedDraftView slug="abc123" />);

    expect(getByTestId("shared-draft-error").textContent).toContain(
      "This draft link is not valid"
    );
    expect(getByTestId("shared-draft-error").textContent).not.toContain(
      "unpublished"
    );
    expect(logError).not.toHaveBeenCalled();
  });

  // An indexer outage must not read as a revoked link.
  it.each([
    new SiweApiError(503, "error", "Governance indexer is not configured."),
    new SiweApiError(502, "error", "Upstream connection refused."),
    new TypeError("Failed to fetch"),
  ])("shows generic outage copy and logs the detail for $message", (error) => {
    const logError = vi.spyOn(console, "error").mockImplementation(() => {});
    failed(error);

    const { getByTestId, container, rerender } = render(
      <SharedDraftView slug="abc123" />
    );

    expect(getByTestId("shared-draft-error").textContent).toBe(
      "Could not load this draft. Please try again later."
    );
    expect(container.textContent).not.toContain(error.message);
    expect(logError).toHaveBeenCalledWith(
      "Could not load shared draft:",
      error
    );

    rerender(<SharedDraftView slug="abc123" />);
    expect(logError).toHaveBeenCalledTimes(1);
  });

  it("renders the title, author, and markdown body", () => {
    loaded(draft());

    const { getByTestId, getByRole, container } = render(
      <SharedDraftView slug="abc123" />
    );

    expect(getByTestId("shared-draft-title").textContent).toBe(
      "Fund the thing"
    );
    expect(container.textContent).toContain(AUTHOR);
    const authorLink = getByRole("link", { name: AUTHOR });
    expect(authorLink.getAttribute("href")).toBe(
      `https://arbiscan.io/address/${AUTHOR}`
    );
    expect(authorLink.getAttribute("target")).toBe("_blank");
    expect(authorLink.getAttribute("rel")).toBe("noopener noreferrer");
    expect(container.querySelector("strong")?.textContent).toBe("bold");
  });

  // rehypeRaw before rehypeSanitize: raw HTML is expanded and then stripped.
  // The reverse order would sanitize nothing and hand the raw HTML to the DOM.
  it("strips raw HTML the author put in the body", () => {
    loaded(
      draft({
        description: [
          "Read <b>this</b>.",
          "<script>window.__pwned = true</script>",
          '<img src="x" onerror="window.__pwned = true">',
          '<a href="javascript:alert(1)">click</a>',
        ].join("\n\n"),
      })
    );

    const { container } = render(<SharedDraftView slug="abc123" />);

    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("[onerror]")).toBeNull();
    expect(container.querySelector('a[href^="javascript:"]')).toBeNull();
    expect(container.querySelector("b")?.textContent).toBe("this");
    expect(
      (window as unknown as { __pwned?: boolean }).__pwned
    ).toBeUndefined();
  });

  it("lists actions with explorer links", () => {
    loaded(
      draft({
        actions: [{ target: GOVERNOR, value: "1000", calldata: "0xdeadbeef" }],
      })
    );

    const { container } = render(<SharedDraftView slug="abc123" />);

    expect(container.textContent).toContain("Actions (1)");
    expect(
      container.querySelector(
        `a[href="https://arbiscan.io/address/${GOVERNOR}"]`
      )
    ).not.toBeNull();
    expect(container.textContent).toContain("0xdeadbeef");
  });

  it("says when a draft has no actions", () => {
    loaded(draft());

    expect(
      render(<SharedDraftView slug="abc123" />).container.textContent
    ).toContain("text only");
  });

  it("shows the recorded submission once on chain", () => {
    loaded(
      draft({
        status: "submitted",
        onchain: {
          transactionHash: TX,
          governorAddress: GOVERNOR,
          proposalId: "42",
          submittedBy: AUTHOR,
          submittedAt: "2026-09-03T00:00:00.000Z",
        },
      })
    );

    const { container } = render(<SharedDraftView slug="abc123" />);

    expect(container.textContent).toContain("Submitted on chain");
    expect(
      container.querySelector('a[href="/proposal/new?draft=d1"]')
    ).toBeNull();
    expect(
      container.querySelector(`a[href="https://arbiscan.io/tx/${TX}"]`)
    ).not.toBeNull();
    expect(
      container.querySelector(`a[href^="/proposal/42?govId="]`)
    ).not.toBeNull();
  });

  it("lets the author open a published draft in the proposal form", () => {
    loaded(draft());
    const { container } = render(<SharedDraftView slug="abc123" />);

    expect(container.textContent).toContain("Open to submit on chain");
    expect(
      container.querySelector('a[href="/proposal/new?draft=d1"]')
    ).not.toBeNull();
    expect(container.querySelector("input")).toBeNull();
  });

  it("keeps the published draft readable without offering submission to a reviewer", () => {
    loaded(draft());
    mocks.useSiwe.mockReturnValue({
      isConnected: false,
      isSignedIn: false,
      effectiveAddress: null,
    });

    const view = render(<SharedDraftView slug="abc123" />);
    expect(view.getByTestId("shared-draft-title")).toBeDefined();
    expect(view.container.textContent).toContain("not been submitted on chain");
    expect(
      view.container.querySelector('a[href="/proposal/new?draft=d1"]')
    ).toBeNull();
    expect(view.container.querySelector("input")).toBeNull();
  });
});
