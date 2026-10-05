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
  publishDraft: vi.fn(),
  deleteDraft: vi.fn(),
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
    isPublishing: false,
    isDeleting: false,
  }),
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
    session();
    list();
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
});
