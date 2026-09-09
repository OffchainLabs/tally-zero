// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
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
  markSubmitted: vi.fn(),
  submitError: null as Error | null,
  toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
}));

vi.mock("@/hooks/use-siwe", () => ({ useSiwe: mocks.useSiwe }));
vi.mock("@/hooks/use-drafts", () => ({
  useSharedDraft: mocks.useSharedDraft,
  useMarkSubmitted: () => ({
    markSubmitted: mocks.markSubmitted,
    isSubmitting: false,
    error: mocks.submitError,
  }),
}));
vi.mock("sonner", () => ({ toast: mocks.toast }));

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
    signIn: vi.fn(),
    isSigningIn: false,
    signInError: null,
  });

describe("SharedDraftView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.submitError = null;
    mocks.markSubmitted.mockResolvedValue(draft({ status: "submitted" }));
    signedIn();
  });

  afterEach(cleanup);

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
    failed(new SiweApiError(404, "not_found", "Draft not found."));

    const { getByTestId } = render(<SharedDraftView slug="abc123" />);

    expect(getByTestId("shared-draft-error").textContent).toContain(
      "This draft link is not valid"
    );
    expect(getByTestId("shared-draft-error").textContent).not.toContain(
      "unpublished"
    );
  });

  // An indexer outage must not read as a revoked link.
  it("does not call an outage an invalid link", () => {
    failed(
      new SiweApiError(503, "error", "Governance indexer is not configured.")
    );

    const { getByTestId } = render(<SharedDraftView slug="abc123" />);

    expect(getByTestId("shared-draft-error").textContent).toContain(
      "Governance indexer is not configured."
    );
    expect(getByTestId("shared-draft-error").textContent).not.toContain(
      "not valid"
    );
  });

  it("renders the title, author, and markdown body", () => {
    loaded(draft());

    const { getByTestId, container } = render(
      <SharedDraftView slug="abc123" />
    );

    expect(getByTestId("shared-draft-title").textContent).toBe(
      "Fund the thing"
    );
    expect(container.textContent).toContain(AUTHOR);
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

  it("shows the submission instead of the form once on chain", () => {
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

    const { container, queryByTestId } = render(
      <SharedDraftView slug="abc123" />
    );

    expect(container.textContent).toContain("Submitted on chain");
    expect(queryByTestId("mark-submitted")).toBeNull();
    expect(
      container.querySelector(`a[href="https://arbiscan.io/tx/${TX}"]`)
    ).not.toBeNull();
    expect(
      container.querySelector(`a[href^="/proposal/42?govId="]`)
    ).not.toBeNull();
  });

  // The read is public; the record is not, because the server signs it with the
  // session's subject. The gate's copy has to be about this page, not profiles.
  it("keeps the draft public but gates the form behind a session", () => {
    loaded(draft());
    mocks.useSiwe.mockReturnValue({
      isConnected: false,
      isSignedIn: false,
      signIn: vi.fn(),
      isSigningIn: false,
      signInError: null,
    });

    const disconnected = render(<SharedDraftView slug="abc123" />);
    expect(disconnected.queryByTestId("shared-draft-title")).not.toBeNull();
    expect(disconnected.queryByTestId("mark-submitted")).toBeNull();
    expect(disconnected.container.textContent).toContain(
      "record this draft's on-chain submission"
    );
    expect(disconnected.container.textContent).not.toContain(
      "delegate profile"
    );
    cleanup();

    mocks.useSiwe.mockReturnValue({
      isConnected: true,
      isSignedIn: false,
      signIn: vi.fn(),
      isSigningIn: false,
      signInError: null,
    });

    const connected = render(<SharedDraftView slug="abc123" />);
    expect(connected.queryByTestId("siwe-sign-in")).not.toBeNull();
    expect(connected.queryByTestId("mark-submitted")).toBeNull();
  });

  it("stays disabled until every field matches what the server accepts", () => {
    loaded(draft());

    const { getByTestId } = render(<SharedDraftView slug="abc123" />);
    const button = getByTestId("mark-submitted") as HTMLButtonElement;

    expect(button.disabled).toBe(true);

    fireEvent.change(getByTestId("draft-tx-hash"), { target: { value: TX } });
    fireEvent.change(getByTestId("draft-governor"), {
      target: { value: GOVERNOR },
    });
    // The server wants a decimal string; a hex id would 400.
    fireEvent.change(getByTestId("draft-proposal-id"), {
      target: { value: "0x2a" },
    });
    expect(button.disabled).toBe(true);

    fireEvent.change(getByTestId("draft-proposal-id"), {
      target: { value: "42" },
    });
    expect(button.disabled).toBe(false);

    fireEvent.change(getByTestId("draft-tx-hash"), {
      target: { value: "0x1234" },
    });
    expect(button.disabled).toBe(true);
  });

  it("submits the trimmed fields", async () => {
    loaded(draft());

    const { getByTestId } = render(<SharedDraftView slug="abc123" />);
    fireEvent.change(getByTestId("draft-tx-hash"), {
      target: { value: ` ${TX} ` },
    });
    fireEvent.change(getByTestId("draft-governor"), {
      target: { value: `${GOVERNOR} ` },
    });
    fireEvent.change(getByTestId("draft-proposal-id"), {
      target: { value: " 42" },
    });
    fireEvent.click(getByTestId("mark-submitted"));

    await waitFor(() =>
      expect(mocks.markSubmitted).toHaveBeenCalledWith({
        transactionHash: TX,
        governorAddress: GOVERNOR,
        proposalId: "42",
      })
    );
    await waitFor(() => expect(mocks.toast.success).toHaveBeenCalled());
  });

  it("shows the server's rejection under the form", () => {
    loaded(draft());
    mocks.submitError = new Error(
      "Only a published draft can be marked submitted (status: submitted)."
    );

    const { getByTestId } = render(<SharedDraftView slug="abc123" />);

    expect(getByTestId("draft-submit-error").textContent).toContain(
      "Only a published draft"
    );
  });
});
