// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GOVERNORS } from "@/config/governors";
import { GLAMSTERDAM_PROPOSAL } from "@/lib/core-governor-payload.fixtures";
import { expectedProposalId, receipt } from "@/lib/drafts/submission-fixtures";
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
  open: vi.fn(),
  useTransactionReceipt: vi.fn(),
}));

vi.mock("@reown/appkit/react", () => ({
  useAppKit: () => ({ open: mocks.open }),
}));

vi.mock("@/hooks/use-siwe", () => ({ useSiwe: mocks.useSiwe }));
// The form reads the typed hash's receipt; the page has no wagmi provider.
vi.mock("wagmi", () => ({
  useTransactionReceipt: mocks.useTransactionReceipt,
}));
// The flattened Core route renders a Tenderly simulation button, whose setup
// dialog reads the settings sheet. The sheet itself is not under test.
vi.mock("@/context/SettingsSheetContext", () => ({
  useSettingsSheet: () => ({ openSettings: vi.fn() }),
}));
vi.mock("@/hooks/use-drafts", () => ({
  useSharedDraft: mocks.useSharedDraft,
  useMarkSubmitted: () => ({
    markSubmitted: mocks.markSubmitted,
    isSubmitting: false,
    error: null,
  }),
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
    isPending: false,
    error: null,
  });

const failed = (error: Error) =>
  mocks.useSharedDraft.mockReturnValue({
    data: undefined,
    isPending: false,
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
    // No hash typed: the receipt query is idle.
    mocks.useTransactionReceipt.mockReturnValue({
      data: undefined,
      error: null,
      refetch: vi.fn(),
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("shows a skeleton while loading", () => {
    mocks.useSharedDraft.mockReturnValue({
      data: undefined,
      isPending: true,
      isLoading: true,
      error: null,
    });

    const { queryByTestId } = render(<SharedDraftView slug="abc123" />);

    expect(queryByTestId("shared-draft-title")).toBeNull();
    expect(queryByTestId("shared-draft-error")).toBeNull();
  });

  // Offline at mount: react-query pauses the fetch, so the query is pending
  // but not loading. That is still a wait, not a bad link.
  it("keeps the skeleton while the fetch is paused offline", () => {
    mocks.useSharedDraft.mockReturnValue({
      data: undefined,
      isPending: true,
      isLoading: false,
      fetchStatus: "paused",
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

  // rehypeRaw before rehypeSanitize: raw HTML is expanded and then filtered
  // by the schema, so safe inline tags survive and the rest is dropped. (The
  // reverse order strips every raw tag, safe ones included; it is lossy, not
  // unsafe.) Only the script and img checks below exercise the schema: React
  // never executes a rendered <script>, drops a string onerror, and
  // neutralises javascript: hrefs on its own.
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
    expect(container.querySelector("b")?.textContent).toBe("this");
  });

  // Classes survive sanitising only when the schema allows them, and the
  // Tailwind build contains `fixed inset-0 z-50`, so an author-chosen class
  // on <code> or <pre> would paint over the page. Only fenced-code language
  // classes may stay. An author-chosen link target is dropped as well.
  it("drops author-chosen classes and link targets from the body", () => {
    loaded(
      draft({
        description: [
          '<code class="fixed inset-0 z-50 bg-background">overlay</code>',
          '<pre class="fixed inset-0 z-50">block</pre>',
          "```js\nconst x = 1;\n```",
          '<a href="https://example.com" target="_blank">out</a>',
        ].join("\n\n"),
      })
    );

    const { container } = render(<SharedDraftView slug="abc123" />);

    expect(container.querySelector(".fixed")).toBeNull();
    expect(container.querySelector(".inset-0")).toBeNull();
    expect(container.querySelector("code.language-js")).not.toBeNull();
    const out = container.querySelector('a[href="https://example.com"]');
    expect(out).not.toBeNull();
    expect(out?.getAttribute("target")).toBeNull();
  });

  it("renders actions as the proposal payload with explorer links", () => {
    loaded(
      draft({
        actions: [{ target: GOVERNOR, value: "1000", calldata: "0xdeadbeef" }],
      })
    );

    const { container } = render(<SharedDraftView slug="abc123" />);

    expect(container.textContent).toContain("Proposal Payload (1)");
    expect(
      container.querySelector(
        `a[href="https://arbiscan.io/address/${GOVERNOR}"]`
      )
    ).not.toBeNull();
    expect(container.textContent).toContain("0xdeadbeef");
  });

  // A Core draft is stored as the single ArbSys action the form will submit.
  // PayloadView must flatten it into the L1 timelock route a reviewer expects,
  // and that needs the Core Governor's address, derived from the draft's type.
  it("flattens a Core Governor draft into its execution route", () => {
    loaded(
      draft({
        governorType: "CONSTITUTIONAL",
        actions: [
          {
            target: GLAMSTERDAM_PROPOSAL.target,
            value: GLAMSTERDAM_PROPOSAL.value,
            calldata: GLAMSTERDAM_PROPOSAL.calldata,
          },
        ],
      })
    );

    const { container } = render(<SharedDraftView slug="abc123" />);

    // The fixture schedules one operation on each chain the route can reach;
    // a raw (unflattened) render would show a single ArbSys call instead.
    expect(container.textContent).toContain("Governance execution route");
    expect(container.textContent).toContain("L1 Timelock");
    for (const chain of ["Ethereum", "Arbitrum One", "Nova"]) {
      expect(container.textContent).toContain(chain);
    }
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
    expect(container.querySelector("input")).not.toBeNull();
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
    expect(view.container.textContent).toContain(
      "No on-chain submission has been recorded for this draft."
    );
    expect(
      view.container.querySelector('a[href="/proposal/new?draft=d1"]')
    ).toBeNull();
    expect(view.container.querySelector("input")).toBeNull();
  });

  // The read is public; the record is not, because the server signs it with
  // the session's subject. The gate's copy has to be about this page.
  it("gates the form behind connect, then sign-in, with page-specific copy", () => {
    loaded(draft());
    mocks.useSiwe.mockReturnValue({
      isConnected: false,
      isSignedIn: false,
      effectiveAddress: null,
      signIn: vi.fn(),
      isSigningIn: false,
      signInError: null,
    });

    const disconnected = render(<SharedDraftView slug="abc123" />);
    expect(disconnected.queryByTestId("shared-draft-title")).not.toBeNull();
    expect(disconnected.queryByTestId("mark-submitted")).toBeNull();
    expect(disconnected.queryByTestId("siwe-connect")).not.toBeNull();
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
      effectiveAddress: null,
      signIn: vi.fn(),
      isSigningIn: false,
      signInError: null,
    });
    const connected = render(<SharedDraftView slug="abc123" />);
    expect(connected.queryByTestId("siwe-sign-in")).not.toBeNull();
    expect(connected.queryByTestId("mark-submitted")).toBeNull();
  });

  it("lets a signed-in delegate record another author's submission", async () => {
    const published = draft();
    const proposalId = expectedProposalId(published);
    loaded(published);
    signedIn();
    mocks.useSiwe.mockReturnValue({
      ...mocks.useSiwe(),
      effectiveAddress: GOVERNOR,
    });
    mocks.useTransactionReceipt.mockReturnValue({
      data: receipt({}, published),
      error: null,
      refetch: vi.fn(),
    });
    mocks.markSubmitted.mockResolvedValue(undefined);
    const view = render(<SharedDraftView slug="abc123" />);
    expect(
      view.queryByRole("link", { name: "Open to submit on chain" })
    ).toBeNull();
    fireEvent.change(view.getByLabelText("Transaction hash"), {
      target: { value: TX },
    });
    fireEvent.change(view.getByLabelText("Proposal id"), {
      target: { value: proposalId },
    });
    // The governor is the draft's, shown rather than asked for.
    expect(view.getByTestId("draft-governor").textContent).toContain(
      GOVERNORS.treasury.address
    );
    await act(async () =>
      fireEvent.click(view.getByRole("button", { name: "Mark as submitted" }))
    );
    expect(mocks.markSubmitted).toHaveBeenCalledExactlyOnceWith({
      transactionHash: TX,
      governorAddress: GOVERNORS.treasury.address,
      proposalId,
    });
  });
});
