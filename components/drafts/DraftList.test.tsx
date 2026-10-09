// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DraftSummary } from "@/lib/siwe/types";

import { DraftList } from "./DraftList";

/**
 * The list and its per-row controls, rendered under jsdom so the confirm step
 * can actually be clicked through. The hooks are mocked at the module boundary:
 * what the server does on publish and delete is the indexer's concern, what the
 * row offers for each status and what it calls on confirm is this file's.
 */

const mocks = vi.hoisted(() => ({
  useSiwe: vi.fn(),
  useDraftsList: vi.fn(),
  publishDraft: vi.fn(),
  deleteDraft: vi.fn(),
  copy: vi.fn(),
  toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
}));

vi.mock("@/hooks/use-siwe", () => ({ useSiwe: mocks.useSiwe }));
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
  title: "Fund the thing",
  governorType: "TREASURY",
  status: "draft",
  shareSlug: null,
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-02T00:00:00.000Z",
  ...overrides,
});

const list = (drafts: DraftSummary[], error: Error | null = null) =>
  mocks.useDraftsList.mockReturnValue({ drafts, isLoading: false, error });

describe("DraftList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useSiwe.mockReturnValue({
      actingAs: null,
      effectiveAddress: "0x1111111111111111111111111111111111111111",
    });
    mocks.publishDraft.mockResolvedValue(summary({ status: "published" }));
    mocks.deleteDraft.mockResolvedValue(undefined);
  });

  afterEach(cleanup);

  it("shows the list error", () => {
    list([], new Error("Sign in with Ethereum to access this resource."));

    const { getByTestId } = render(<DraftList />);

    expect(getByTestId("drafts-error").textContent).toContain(
      "Sign in with Ethereum"
    );
  });

  it("offers a new proposal when there are no drafts", () => {
    list([]);

    const { container, queryByTestId } = render(<DraftList />);

    expect(queryByTestId("drafts-list")).toBeNull();
    expect(container.textContent).toContain("No drafts yet");
    expect(container.querySelector('a[href="/proposal/new"]')).not.toBeNull();
  });

  // Drafts belong to the effective subject, so a Safe's list must say so.
  it("names the Safe when acting as one", () => {
    mocks.useSiwe.mockReturnValue({ actingAs: SAFE, effectiveAddress: SAFE });
    list([summary()]);

    const { getByTestId } = render(<DraftList />);

    expect(getByTestId("drafts-subject").textContent).toContain(SAFE);
  });

  it("does not mention a subject when acting as the signer", () => {
    list([summary()]);

    expect(render(<DraftList />).queryByTestId("drafts-subject")).toBeNull();
  });

  it("offers open, publish, and delete on an editable draft, and no share link", () => {
    list([summary()]);

    const { getByTestId, queryByTestId } = render(<DraftList />);

    expect(getByTestId("open-draft").textContent).toContain("Open in form");
    expect(getByTestId("open-draft").getAttribute("href")).toBe(
      "/proposal/new?draft=d1"
    );
    expect(queryByTestId("publish-draft")).not.toBeNull();
    expect(queryByTestId("delete-draft")).not.toBeNull();
    expect(queryByTestId("copy-share-link")).toBeNull();
  });

  // The server answers 409 to PATCH and DELETE once published, and the loader
  // opens a frozen draft as a copy, so the row offers exactly that.
  it.each(["published", "submitted"] as const)(
    "offers only the share link and a copy on a %s draft",
    (status) => {
      list([summary({ status, shareSlug: "abc123" })]);

      const { getByTestId, queryByTestId, container } = render(<DraftList />);

      expect(getByTestId("open-draft").textContent).toContain("Open as copy");
      expect(queryByTestId("publish-draft")).toBeNull();
      expect(queryByTestId("delete-draft")).toBeNull();
      expect(queryByTestId("copy-share-link")).not.toBeNull();
      expect(
        container.querySelector('a[href="/drafts/shared/abc123"]')
      ).not.toBeNull();
    }
  );

  it("copies the absolute share link", () => {
    list([summary({ status: "published", shareSlug: "abc123" })]);

    const { getByTestId } = render(<DraftList />);
    fireEvent.click(getByTestId("copy-share-link"));

    expect(mocks.copy).toHaveBeenCalledWith(
      `${window.location.origin}/drafts/shared/abc123`
    );
  });

  it("publishes only after the row-level confirm", async () => {
    list([summary()]);

    const { getByTestId, getByText, container } = render(<DraftList />);
    fireEvent.click(getByTestId("publish-draft"));

    expect(mocks.publishDraft).not.toHaveBeenCalled();
    expect(container.textContent).toContain("This cannot be undone");

    fireEvent.click(getByTestId("confirm-publish"));

    await waitFor(() => expect(mocks.publishDraft).toHaveBeenCalledWith("d1"));
    await waitFor(() => expect(mocks.toast.success).toHaveBeenCalled());
    expect(getByText("Publish")).toBeDefined();
  });

  it("cancelling the confirm restores the controls without calling anything", () => {
    list([summary()]);

    const { getByTestId, getByText, queryByTestId } = render(<DraftList />);
    fireEvent.click(getByTestId("delete-draft"));
    expect(queryByTestId("confirm-delete")).not.toBeNull();

    fireEvent.click(getByText("Cancel"));

    expect(queryByTestId("confirm-delete")).toBeNull();
    expect(queryByTestId("delete-draft")).not.toBeNull();
    expect(mocks.deleteDraft).not.toHaveBeenCalled();
  });

  it("deletes after confirm", async () => {
    list([summary()]);

    const { getByTestId } = render(<DraftList />);
    fireEvent.click(getByTestId("delete-draft"));
    fireEvent.click(getByTestId("confirm-delete"));

    await waitFor(() => expect(mocks.deleteDraft).toHaveBeenCalledWith("d1"));
    await waitFor(() =>
      expect(mocks.toast.success).toHaveBeenCalledWith("Draft deleted.")
    );
  });

  // The server's message is the useful one (409 not_editable, 401), so it is
  // what the toast shows.
  it("surfaces a rejected publish as an error toast and leaves the row usable", async () => {
    mocks.publishDraft.mockRejectedValue(
      new Error("Draft is already published.")
    );
    list([summary()]);

    const { getByTestId, queryByTestId } = render(<DraftList />);
    fireEvent.click(getByTestId("publish-draft"));
    fireEvent.click(getByTestId("confirm-publish"));

    await waitFor(() =>
      expect(mocks.toast.error).toHaveBeenCalledWith(
        "Draft is already published."
      )
    );
    expect(queryByTestId("confirm-publish")).toBeNull();
    expect(queryByTestId("publish-draft")).not.toBeNull();
  });
});
