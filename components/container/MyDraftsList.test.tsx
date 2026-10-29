// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import DraftsPage from "@/app/drafts/page";
import type { DraftSummary } from "@/lib/siwe/types";

import MyDraftsList from "./MyDraftsList";
import { ProposalsTabs } from "./ProposalsTabs";

const mocks = vi.hoisted(() => ({
  useSiwe: vi.fn(),
  useDraftsList: vi.fn(),
  useProposalEligibility: vi.fn(),
  publishDraft: vi.fn(),
  deleteDraft: vi.fn(),
  isPublishing: false,
  signIn: vi.fn(),
  open: vi.fn(),
  copy: vi.fn(),
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("@/hooks/use-siwe", () => ({ useSiwe: mocks.useSiwe }));
vi.mock("@reown/appkit/react", () => ({
  useAppKit: () => ({ open: mocks.open }),
}));
vi.mock("@/hooks/use-drafts", () => ({
  useDraftsList: mocks.useDraftsList,
  useDraftMutations: () => ({
    publishDraft: mocks.publishDraft,
    deleteDraft: mocks.deleteDraft,
    isPublishing: mocks.isPublishing,
    isDeleting: false,
  }),
}));
vi.mock("@/hooks/use-proposal-eligibility", () => ({
  useProposalEligibility: mocks.useProposalEligibility,
}));
vi.mock("@/hooks/use-copy-to-clipboard", () => ({
  useCopyToClipboard: () => ({ copy: mocks.copy, copied: false }),
}));
vi.mock("sonner", () => ({ toast: mocks.toast }));
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: React.ComponentProps<"a"> & { href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const SAFE = "0x2222222222222222222222222222222222222222";
const summary = (overrides: Partial<DraftSummary> = {}): DraftSummary => ({
  id: "d1",
  title: "Fund documentation bounties",
  governorType: "TREASURY",
  status: "draft",
  shareSlug: null,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-02T00:00:00Z",
  ...overrides,
});

function session(overrides: Record<string, unknown> = {}) {
  mocks.useSiwe.mockReturnValue({
    isSignedIn: true,
    isConnected: true,
    isLoadingSession: false,
    actingAs: null,
    effectiveAddress: "0x1111111111111111111111111111111111111111",
    signIn: mocks.signIn,
    isSigningIn: false,
    signInError: null,
    ...overrides,
  });
}

function list(drafts: DraftSummary[] = [], error: Error | null = null) {
  mocks.useDraftsList.mockReturnValue({ drafts, isLoading: false, error });
}

describe("MyDraftsList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isPublishing = false;
    session();
    list();
    mocks.useProposalEligibility.mockReturnValue({ eligibility: "meets" });
    mocks.publishDraft.mockResolvedValue(summary({ status: "published" }));
    mocks.deleteDraft.mockResolvedValue(undefined);
    mocks.signIn.mockResolvedValue(undefined);
  });

  afterEach(cleanup);

  it("shows a placeholder while the session or list loads", () => {
    session({ isSignedIn: false, isLoadingSession: true });
    expect(
      render(<MyDraftsList />).getByTestId("drafts-loading")
    ).toBeDefined();
    cleanup();

    session();
    mocks.useDraftsList.mockReturnValue({
      drafts: [],
      isLoading: true,
      error: null,
    });
    expect(
      render(<MyDraftsList />).getByTestId("drafts-loading")
    ).toBeDefined();
  });

  it("offers wallet connection without proposal actions when signed out", () => {
    session({ isSignedIn: false, isConnected: false });
    const view = render(<MyDraftsList />);
    expect(view.getByTestId("siwe-connect")).toBeDefined();
    fireEvent.click(view.getByRole("button", { name: "Connect Wallet" }));
    expect(mocks.open).toHaveBeenCalledExactlyOnceWith({ view: "Connect" });
    expect(mocks.signIn).not.toHaveBeenCalled();
    expect(
      view.getByRole("heading", { name: "Sign in to see your drafts" })
    ).toBeDefined();
    expect(view.container.textContent).toContain("follow you across devices");
    expect(view.container.textContent).toContain(
      "kept in this browser until you save it"
    );
    expect(
      view
        .getByRole("heading", { name: "Sign in to see your drafts" })
        .closest(".glass")?.className
    ).toContain("text-center");
    expect(view.container.querySelector('a[href="/proposal/new"]')).toBeNull();
  });

  it("offers Sign in with Ethereum when a wallet is connected", () => {
    session({ isSignedIn: false });
    const view = render(<MyDraftsList />);

    fireEvent.click(view.getByTestId("siwe-sign-in"));

    expect(view.getByTestId("siwe-sign-in").textContent).toBe(
      "Sign in with Ethereum"
    );
    expect(view.container.textContent).toContain(
      "Drafts are saved to your account from the New Proposal page"
    );
    expect(view.container.textContent).toContain(
      "kept in this browser until you save it"
    );
    expect(view.container.querySelector('a[href="/proposal/new"]')).toBeNull();
    expect(view.getAllByRole("button")).toHaveLength(1);
    expect(mocks.signIn).toHaveBeenCalledOnce();
  });

  it("links the My Drafts control to the dedicated /drafts page", () => {
    const view = render(
      <ProposalsTabs>
        <p>Proposals table</p>
      </ProposalsTabs>
    );
    expect(
      view.getByRole("navigation", { name: "Proposal views" })
    ).toBeDefined();
    expect(
      view.getByRole("link", { name: "My Drafts" }).getAttribute("href")
    ).toBe("/drafts");
    expect(view.getByText("Proposals table")).toBeDefined();
    expect(view.queryByTestId("siwe-sign-in")).toBeNull();
  });

  it("renders /drafts in the proposals layout with My Drafts selected", () => {
    session({ isSignedIn: false });
    const view = render(<DraftsPage />);

    expect(
      view.getByRole("link", { name: "My Drafts" }).getAttribute("aria-current")
    ).toBe("true");
    expect(
      view.getByRole("link", { name: "Proposals" }).getAttribute("href")
    ).toBe("/proposals");
    expect(view.getByTestId("siwe-sign-in")).toBeDefined();
    expect(view.queryByRole("link", { name: "New Proposal" })).toBeNull();
    expect(
      view.container.querySelector('[style*="stars-bg.svg"]')
    ).not.toBeNull();
    expect(
      view.container.querySelector('[style*="illustration.png"]')
    ).not.toBeNull();
  });

  it("shows New Proposal on /drafts once signed in", () => {
    session();
    list([summary()]);
    const view = render(<DraftsPage />);

    expect(
      view.getByRole("link", { name: "New Proposal" }).getAttribute("href")
    ).toBe("/proposal/new");
    expect(view.getByTestId("drafts-list")).toBeDefined();
  });

  it("shows the list error or an empty state with a new proposal link", () => {
    list([], new Error("upstream unavailable"));
    expect(
      render(<MyDraftsList />).getByTestId("drafts-error").textContent
    ).toContain("upstream unavailable");
    cleanup();

    list();
    const empty = render(<MyDraftsList />);
    expect(empty.container.textContent).toContain("No drafts yet");
    expect(
      empty.container.querySelector('a[href="/proposal/new"]')
    ).not.toBeNull();
  });

  it("shows the current Safe and sorts drafts newest first", () => {
    session({ actingAs: SAFE, effectiveAddress: SAFE });
    list([
      summary(),
      summary({ id: "d2", title: "Newer", updatedAt: "2026-03-01T00:00:00Z" }),
    ]);

    const view = render(<MyDraftsList />);
    expect(view.getByTestId("drafts-subject").textContent).toContain(SAFE);
    expect(view.container.textContent?.indexOf("Newer")).toBeLessThan(
      view.container.textContent!.indexOf("Fund documentation bounties")
    );
    expect(
      view.container.querySelector('a[href="/proposal/new?draft=d1"]')
    ).not.toBeNull();
  });

  it("offers open, publish, and delete only for editable drafts", () => {
    list([summary()]);
    const view = render(<MyDraftsList />);
    expect(view.getByTestId("open-draft").textContent).toContain(
      "Continue editing"
    );
    expect(view.getByTestId("publish-draft")).toBeDefined();
    expect(view.getByTestId("delete-draft")).toBeDefined();
    expect(view.queryByTestId("copy-share-link")).toBeNull();
  });

  // Publishing mints the share link, which the server only grants to wallets at
  // or above the draft's governor threshold. Editing stays open: the form's
  // browser autosave does not need the threshold.
  it("disables publish, with the reason, for a wallet below the threshold", () => {
    mocks.useProposalEligibility.mockReturnValue({ eligibility: "below" });
    list([summary({ governorType: "CONSTITUTIONAL" })]);

    const view = render(<MyDraftsList />);
    const publish = view.getByTestId("publish-draft") as HTMLButtonElement;

    expect(publish.disabled).toBe(true);
    expect(publish.title).toBe(
      "Publishing a draft requires voting power at or above the Core Governor proposal threshold."
    );
    expect(mocks.useProposalEligibility).toHaveBeenCalledWith("core");
    expect(view.getByTestId("publish-threshold-notice").textContent).toBe(
      publish.title
    );
    expect(view.getByTestId("open-draft")).toBeDefined();
    expect(
      (view.getByTestId("delete-draft") as HTMLButtonElement).disabled
    ).toBe(false);
  });

  it("disables publish while eligibility is still being read", () => {
    mocks.useProposalEligibility.mockReturnValue({ eligibility: "unknown" });
    list([summary()]);

    const view = render(<MyDraftsList />);
    const publish = view.getByTestId("publish-draft") as HTMLButtonElement;

    expect(publish.disabled).toBe(true);
    expect(publish.title).toContain("Checking your voting power");
    expect(view.queryByTestId("publish-threshold-notice")).toBeNull();
  });

  it.each([
    ["published", "Open to submit"],
    ["submitted", "Open as copy"],
  ] as const)(
    "offers the form and share controls for a %s draft",
    (status, label) => {
      list([summary({ status, shareSlug: "abc123" })]);
      const view = render(<MyDraftsList />);
      expect(view.getByTestId("open-draft").textContent).toContain(label);
      expect(view.queryByTestId("publish-draft")).toBeNull();
      expect(view.queryByTestId("delete-draft")).toBeNull();
      expect(view.getByTestId("copy-share-link")).toBeDefined();
      expect(
        view.container.querySelector('a[href="/drafts/shared/abc123"]')
      ).not.toBeNull();
    }
  );

  it("copies the absolute share link", () => {
    list([summary({ status: "published", shareSlug: "abc123" })]);
    const view = render(<MyDraftsList />);
    fireEvent.click(view.getByTestId("copy-share-link"));
    expect(mocks.copy).toHaveBeenCalledWith(
      `${window.location.origin}/drafts/shared/abc123`
    );
  });

  it("publishes only after confirmation", async () => {
    list([summary()]);
    const view = render(<MyDraftsList />);
    fireEvent.click(view.getByTestId("publish-draft"));
    expect(mocks.publishDraft).not.toHaveBeenCalled();
    expect(view.container.textContent).toContain("This cannot be undone");
    fireEvent.click(view.getByTestId("confirm-publish"));
    await waitFor(() => expect(mocks.publishDraft).toHaveBeenCalledWith("d1"));
    await waitFor(() => expect(mocks.toast.success).toHaveBeenCalled());
  });

  it("disables both confirm buttons while the request is in flight", () => {
    mocks.isPublishing = true;
    list([summary()]);
    const view = render(<MyDraftsList />);
    fireEvent.click(view.getByTestId("publish-draft"));
    expect(
      (view.getByTestId("confirm-publish") as HTMLButtonElement).disabled
    ).toBe(true);
    expect((view.getByText("Cancel") as HTMLButtonElement).disabled).toBe(true);
  });

  it("cancels deletion and deletes only after confirmation", async () => {
    list([summary()]);
    const view = render(<MyDraftsList />);
    fireEvent.click(view.getByTestId("delete-draft"));
    fireEvent.click(view.getByText("Cancel"));
    expect(mocks.deleteDraft).not.toHaveBeenCalled();
    fireEvent.click(view.getByTestId("delete-draft"));
    fireEvent.click(view.getByTestId("confirm-delete"));
    await waitFor(() => expect(mocks.deleteDraft).toHaveBeenCalledWith("d1"));
    await waitFor(() =>
      expect(mocks.toast.success).toHaveBeenCalledWith("Draft deleted.")
    );
  });

  it("shows a failed publish and restores the row controls", async () => {
    mocks.publishDraft.mockRejectedValue(
      new Error("Draft is already published.")
    );
    list([summary()]);
    const view = render(<MyDraftsList />);
    fireEvent.click(view.getByTestId("publish-draft"));
    fireEvent.click(view.getByTestId("confirm-publish"));
    await waitFor(() =>
      expect(mocks.toast.error).toHaveBeenCalledWith(
        "Draft is already published."
      )
    );
    expect(view.queryByTestId("confirm-publish")).toBeNull();
    expect(view.getByTestId("publish-draft")).toBeDefined();
  });
});
