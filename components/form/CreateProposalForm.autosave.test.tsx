// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  PROPOSAL_DRAFT_AUTOSAVE_DEBOUNCE_MS,
  proposalDraftStorageKey,
  STORAGE_KEYS,
} from "@/config/storage-keys";
import {
  createProposalDraft,
  parseProposalDraft,
} from "@/lib/create-proposal-form-utils";

import { ProposalDraftLoader } from "@/components/drafts/ProposalDraftLoader";
import type { Draft } from "@/lib/siwe/types";

import CreateProposalForm from "./CreateProposalForm";

/**
 * The browser autosave, run for real: which localStorage slot the form reads,
 * writes, and deletes, and what the status bar says while it does. Everything
 * here is an effect, so this file alone runs under jsdom (see the pragma above);
 * the rest of the suite stays on node. The same mocks as the static form test
 * keep wagmi and the markdown editor out of the way.
 */

const mocks = vi.hoisted(() => ({
  searchParams: new URLSearchParams(),
  pathname: "/proposal/new",
  replace: vi.fn(),
  useSiwe: vi.fn(),
  useDraft: vi.fn(),
  createDraft: vi.fn(),
  patchDraft: vi.fn(),
  useAccount: vi.fn(),
  useGovernanceClock: vi.fn(),
  useReadContract: vi.fn(),
  useSimulateContract: vi.fn(),
  useWaitForTransactionReceipt: vi.fn(),
  useWriteContract: vi.fn(),
  toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => mocks.searchParams,
  usePathname: () => mocks.pathname,
  useRouter: () => ({ replace: mocks.replace }),
}));
vi.mock("@/hooks/use-siwe", () => ({ useSiwe: mocks.useSiwe }));
vi.mock("@/hooks/use-drafts", () => ({
  useDraft: mocks.useDraft,
  useDraftMutations: () => ({
    createDraft: mocks.createDraft,
    patchDraft: mocks.patchDraft,
    isCreating: false,
    isPatching: false,
  }),
}));

vi.mock("sonner", () => ({ toast: mocks.toast }));

vi.mock("next-themes", () => ({ useTheme: () => ({ resolvedTheme: "dark" }) }));

vi.mock("next/dynamic", () => ({
  default: () =>
    function MDEditorStub() {
      return null;
    },
}));

vi.mock("wagmi", () => ({
  useAccount: mocks.useAccount,
  useReadContract: mocks.useReadContract,
  useSimulateContract: mocks.useSimulateContract,
  useWaitForTransactionReceipt: mocks.useWaitForTransactionReceipt,
  useWriteContract: mocks.useWriteContract,
}));

vi.mock("@/hooks/use-governance-clock", () => ({
  useGovernanceClock: mocks.useGovernanceClock,
}));

// Node ships its own experimental `localStorage` global, which stays undefined
// without `--localstorage-file` and shadows jsdom's. An in-memory Storage is
// all the form needs.
function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key) => map.get(key) ?? null,
    key: (index) => [...map.keys()][index] ?? null,
    removeItem: (key) => {
      map.delete(key);
    },
    setItem: (key, value) => {
      map.set(key, String(value));
    },
  };
}

function installStorage() {
  const storage = memoryStorage();
  vi.stubGlobal("localStorage", storage);
  if (window !== globalThis) {
    Object.defineProperty(window, "localStorage", {
      value: storage,
      configurable: true,
    });
  }
}

const BARE_KEY = STORAGE_KEYS.PROPOSAL_DRAFT;
const DRAFT_KEY = proposalDraftStorageKey("d1");
const ACCOUNT = "0x1234567890abcdef1234567890abcdef12345678";
const STORED_TARGET = "0x2222222222222222222222222222222222222222";
const SCRATCH_TARGET = "0x3333333333333333333333333333333333333333";
const TYPED_TARGET = "0x4444444444444444444444444444444444444444";

// A draft stored on the server on New Year's Day; every local copy in these
// tests is dated relative to it.
const SERVER_UPDATED_AT = "2026-01-01T00:00:00Z";
const SERVER_AT = Date.parse(SERVER_UPDATED_AT);

const stored = {
  title: "Stored draft",
  description: "# Stored\n\nbody",
  governorType: "core" as const,
  actions: [
    { id: "restored-0", target: STORED_TARGET, value: "5", calldata: "0x" },
  ],
  updatedAt: SERVER_UPDATED_AT,
};

const serverDraft: Draft = {
  id: "d1",
  author: ACCOUNT,
  title: stored.title,
  description: stored.description,
  governorType: "CONSTITUTIONAL",
  actions: [{ target: STORED_TARGET, value: "5", calldata: "0x" }],
  status: "draft",
  shareSlug: null,
  onchain: null,
  createdAt: SERVER_UPDATED_AT,
  updatedAt: SERVER_UPDATED_AT,
};

function seedSlot(
  key: string,
  target: string,
  savedAt: number,
  governorType: "core" | "treasury" = "core"
) {
  window.localStorage.setItem(
    key,
    JSON.stringify(
      createProposalDraft({
        governorType,
        description: "scratch",
        actions: [{ target, value: "1", calldata: "0x" }],
        savedAt,
      })
    )
  );
}

const slot = (key: string) =>
  parseProposalDraft(window.localStorage.getItem(key));

const targetInput = (container: HTMLElement) =>
  container.querySelector<HTMLInputElement>('input[id^="target-"]')!;

const status = (container: HTMLElement) =>
  container.querySelector<HTMLElement>('[data-testid="draft-save-status"]')!;

function typeTarget(container: HTMLElement, value: string) {
  fireEvent.change(targetInput(container), { target: { value } });
}

function settle() {
  act(() => {
    vi.advanceTimersByTime(PROPOSAL_DRAFT_AUTOSAVE_DEBOUNCE_MS);
  });
}

describe("CreateProposalForm browser autosave", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    installStorage();
    mocks.searchParams = new URLSearchParams("draft=d1");
    mocks.pathname = "/proposal/new";
    mocks.useSiwe.mockReturnValue({
      isSignedIn: true,
      isLoadingSession: false,
      effectiveAddress: ACCOUNT,
    });
    mocks.useDraft.mockReturnValue({
      data: serverDraft,
      isLoading: false,
      error: null,
    });

    mocks.useGovernanceClock.mockReturnValue({
      clockBlock: BigInt(23_456_789),
      isLoading: false,
    });
    mocks.useAccount.mockReturnValue({
      address: "0x1111111111111111111111111111111111111111",
      isConnected: true,
    });
    mocks.useReadContract.mockReturnValue({
      data: undefined,
      isLoading: false,
    });
    mocks.useSimulateContract.mockReturnValue({
      data: undefined,
      error: null,
      isError: false,
      isFetching: false,
    });
    mocks.useWriteContract.mockReturnValue({
      error: null,
      isPending: false,
      writeContract: vi.fn(),
    });
    mocks.useWaitForTransactionReceipt.mockReturnValue({
      isLoading: false,
      isSuccess: false,
      error: null,
    });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("writes the anonymous slot a moment after the last edit, not before", () => {
    const { container } = render(<CreateProposalForm />);
    expect(status(container).dataset.state).toBe("never");

    typeTarget(container, TYPED_TARGET);
    expect(status(container).dataset.state).toBe("unsaved");

    act(() => {
      vi.advanceTimersByTime(PROPOSAL_DRAFT_AUTOSAVE_DEBOUNCE_MS - 1);
    });
    expect(slot(BARE_KEY)).toBeNull();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(slot(BARE_KEY)?.actions[0]).toMatchObject({ target: TYPED_TARGET });
    expect(status(container).dataset.state).toBe("local");
    expect(status(container).textContent).toContain(
      "Saved on this browser only"
    );
  });

  // Regression: a draft opened from the account once shared the anonymous
  // form's slot, so opening it either restored an unrelated scratch over it
  // or deleted that scratch, and every autosave then overwrote the scratch.
  it("leaves the anonymous slot alone when opened on a server draft", () => {
    seedSlot(BARE_KEY, SCRATCH_TARGET, SERVER_AT + 60_000);
    const scratchBefore = window.localStorage.getItem(BARE_KEY);

    const { container } = render(
      <CreateProposalForm
        initialDraft={stored}
        draftId="d1"
        accountAddress={ACCOUNT}
      />
    );

    expect(targetInput(container).value).toBe(STORED_TARGET);
    expect(status(container).dataset.state).toBe("server");
    expect(window.localStorage.getItem(BARE_KEY)).toBe(scratchBefore);

    typeTarget(container, TYPED_TARGET);
    settle();

    expect(slot(DRAFT_KEY)?.actions[0]).toMatchObject({ target: TYPED_TARGET });
    expect(window.localStorage.getItem(BARE_KEY)).toBe(scratchBefore);
  });

  it("restores this draft's slot over the server copy only when it is newer", () => {
    seedSlot(DRAFT_KEY, SCRATCH_TARGET, SERVER_AT + 60_000);
    const newer = render(
      <CreateProposalForm
        initialDraft={stored}
        draftId="d1"
        accountAddress={ACCOUNT}
      />
    );

    expect(targetInput(newer.container).value).toBe(SCRATCH_TARGET);
    expect(status(newer.container).dataset.state).toBe("local");
    expect(status(newer.container).textContent).toContain(
      "Restored unsaved edits from this browser"
    );
    expect(slot(DRAFT_KEY)).not.toBeNull();

    cleanup();
    window.localStorage.clear();

    seedSlot(DRAFT_KEY, SCRATCH_TARGET, SERVER_AT - 60_000);
    const older = render(
      <CreateProposalForm
        initialDraft={stored}
        draftId="d1"
        accountAddress={ACCOUNT}
      />
    );

    expect(targetInput(older.container).value).toBe(STORED_TARGET);
    expect(status(older.container).dataset.state).toBe("server");
    // Older than the server copy: nothing to recover, and the slot goes.
    expect(slot(DRAFT_KEY)).toBeNull();
  });

  it("drops the browser copy and names the account once a server save is reported", () => {
    const { container, rerender } = render(
      <CreateProposalForm accountAddress={ACCOUNT} />
    );
    typeTarget(container, TYPED_TARGET);
    settle();
    expect(slot(BARE_KEY)).not.toBeNull();

    // The loader reports the save with exactly what was sent, and binds the
    // form to the draft the server created, in the same render.
    rerender(
      <CreateProposalForm
        accountAddress={ACCOUNT}
        draftId="d1"
        serverSave={{
          at: Date.now(),
          address: ACCOUNT,
          snapshot: {
            governorType: "treasury",
            description: "",
            actions: [{ target: TYPED_TARGET, value: "0", calldata: "0x" }],
          },
        }}
      />
    );

    expect(slot(BARE_KEY)).toBeNull();
    expect(slot(DRAFT_KEY)).toBeNull();
    expect(status(container).dataset.state).toBe("server");
    expect(status(container).textContent).toContain(
      "Saved to your drafts as 0x1234...5678"
    );

    // Edits after the save go to the bound draft's slot, not the anonymous one.
    typeTarget(container, SCRATCH_TARGET);
    settle();
    expect(slot(DRAFT_KEY)?.actions[0]).toMatchObject({
      target: SCRATCH_TARGET,
    });
    expect(slot(BARE_KEY)).toBeNull();
  });

  it.each(["debounce", "pagehide", "unmount"])(
    "keeps recovery isolated when the session expires before %s",
    (flush) => {
      seedSlot(BARE_KEY, SCRATCH_TARGET, SERVER_AT + 60_000);
      const scratchBefore = window.localStorage.getItem(BARE_KEY);
      const view = render(<ProposalDraftLoader />);
      typeTarget(view.container, TYPED_TARGET);

      mocks.useSiwe.mockReturnValue({
        isSignedIn: false,
        isLoadingSession: false,
        effectiveAddress: null,
      });
      mocks.useDraft.mockReturnValue({
        data: undefined,
        isLoading: false,
        error: null,
      });
      view.rerender(<ProposalDraftLoader />);
      expect(targetInput(view.container).value).toBe(TYPED_TARGET);

      if (flush === "unmount") view.unmount();
      else if (flush === "pagehide") fireEvent(window, new Event("pagehide"));
      else settle();

      expect(window.localStorage.getItem(BARE_KEY)).toBe(scratchBefore);
      expect(slot(DRAFT_KEY)).toMatchObject({
        description: stored.description,
        actions: [{ target: TYPED_TARGET, value: "5", calldata: "0x" }],
      });
    }
  );

  it.each(["blank", "published"])(
    "ignores a delayed create after leaving a %s form",
    async (opened) => {
      if (opened === "blank") {
        mocks.searchParams = new URLSearchParams();
        mocks.useDraft.mockReturnValue({
          data: undefined,
          isLoading: false,
          error: null,
        });
        seedSlot(BARE_KEY, SCRATCH_TARGET, SERVER_AT);
      } else {
        mocks.useDraft.mockReturnValue({
          data: { ...serverDraft, status: "published" },
          isLoading: false,
          error: null,
        });
      }
      let resolve!: (draft: Draft) => void;
      mocks.createDraft.mockReturnValue(
        new Promise<Draft>((done) => {
          resolve = done;
        })
      );
      const view = render(<ProposalDraftLoader />);
      fireEvent.click(view.getByTestId("open-save-to-drafts"));
      fireEvent.click(view.getByTestId("confirm-save-to-drafts"));
      expect(mocks.createDraft).toHaveBeenCalledTimes(1);
      view.unmount();

      await act(async () => resolve({ ...serverDraft, id: "new-draft" }));
      expect(mocks.replace).not.toHaveBeenCalled();
    }
  );

  it.each(["draft", "pathname", "away and back"])(
    "ignores a delayed create after %s navigation with the loader still mounted",
    async (navigation) => {
      mocks.useDraft.mockReturnValue({
        data: { ...serverDraft, status: "published" },
        isLoading: false,
        error: null,
      });
      let resolve!: (draft: Draft) => void;
      mocks.createDraft.mockReturnValue(
        new Promise<Draft>((done) => {
          resolve = done;
        })
      );
      const view = render(<ProposalDraftLoader />);
      fireEvent.click(view.getByTestId("open-save-to-drafts"));
      fireEvent.click(view.getByTestId("confirm-save-to-drafts"));
      if (navigation === "pathname") mocks.pathname = "/elsewhere";
      else mocks.searchParams = new URLSearchParams("draft=another-draft");
      view.rerender(<ProposalDraftLoader />);
      if (navigation === "away and back") {
        mocks.searchParams = new URLSearchParams("draft=d1");
        view.rerender(<ProposalDraftLoader />);
      }

      await act(async () => resolve({ ...serverDraft, id: "new-draft" }));
      expect(mocks.replace).not.toHaveBeenCalled();
      expect(view.getByTestId("open-save-to-drafts").textContent).toBe(
        "Save as new draft"
      );
    }
  );

  it.each(["blank", "published"])(
    "migrates recovery after a %s create and updates the new draft on the next save",
    async (opened) => {
      if (opened === "blank") {
        mocks.searchParams = new URLSearchParams();
        mocks.useDraft.mockReturnValue({
          data: undefined,
          isLoading: false,
          error: null,
        });
        seedSlot(BARE_KEY, SCRATCH_TARGET, SERVER_AT);
      } else {
        mocks.useDraft.mockReturnValue({
          data: { ...serverDraft, status: "published" },
          isLoading: false,
          error: null,
        });
      }
      const created = { ...serverDraft, id: "new-draft" };
      mocks.createDraft.mockResolvedValue(created);
      mocks.patchDraft.mockResolvedValue(created);
      const view = render(<ProposalDraftLoader />);
      typeTarget(view.container, TYPED_TARGET);
      settle();
      fireEvent.click(view.getByTestId("open-save-to-drafts"));
      await act(async () =>
        fireEvent.click(view.getByTestId("confirm-save-to-drafts"))
      );
      expect(mocks.replace).toHaveBeenCalledWith(
        "/proposal/new?draft=new-draft"
      );
      expect(slot(opened === "blank" ? BARE_KEY : DRAFT_KEY)).toBeNull();

      mocks.searchParams = new URLSearchParams("draft=new-draft");
      mocks.useDraft.mockReturnValue({
        data: created,
        isLoading: false,
        error: null,
      });
      view.rerender(<ProposalDraftLoader />);
      typeTarget(view.container, SCRATCH_TARGET);
      settle();
      expect(slot(proposalDraftStorageKey(created.id))?.actions[0].target).toBe(
        SCRATCH_TARGET
      );
      fireEvent.click(view.getByTestId("open-save-to-drafts"));
      await act(async () =>
        fireEvent.click(view.getByTestId("confirm-save-to-drafts"))
      );
      expect(mocks.createDraft).toHaveBeenCalledTimes(1);
      expect(mocks.patchDraft).toHaveBeenCalledWith(
        expect.objectContaining({
          id: created.id,
          actions: [expect.objectContaining({ target: SCRATCH_TARGET })],
        })
      );
      expect(slot(proposalDraftStorageKey(created.id))).toBeNull();
    }
  );
});
