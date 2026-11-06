// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import CandidateProfilePage from "@/app/security-council/candidate/page";
import {
  useCandidateProfile,
  usePublicCandidateProfile,
} from "@/hooks/use-candidate-profile";
import { siweApi } from "@/lib/siwe/client";
import { siweKeys } from "@/lib/siwe/keys";
import type {
  CandidateProfileVersion,
  ElectionSummary,
  MeResponse,
  MyCandidateProfile,
} from "@/lib/siwe/types";

const mocks = vi.hoisted(() => ({
  useAccount: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));
vi.mock("wagmi", () => ({
  useAccount: mocks.useAccount,
  useSignMessage: () => ({ signMessageAsync: vi.fn() }),
}));
vi.mock("@reown/appkit/react", () => ({
  useAppKit: () => ({ open: vi.fn() }),
}));
vi.mock("sonner", () => ({
  toast: { error: mocks.toastError, success: mocks.toastSuccess },
}));

const SIGNER = "0x1111111111111111111111111111111111111111";
const SAFE = "0x2222222222222222222222222222222222222222";
const ELECTION: ElectionSummary = {
  id: "0xgov:7",
  cohort: 1,
  status: "nominee",
  startedAt: "2026-05-01T00:00:00Z",
  closedAt: null,
};
const PREVIOUS: ElectionSummary = {
  id: "0xgov:6",
  cohort: 0,
  status: "complete",
  startedAt: "2025-11-01T00:00:00Z",
  closedAt: "2025-12-01T00:00:00Z",
};

function profile(
  address = SIGNER,
  name = "Signer profile",
  electionId = ELECTION.id
): CandidateProfileVersion {
  return {
    address,
    electionId,
    version: 1,
    createdAt: "2026-05-02T00:00:00Z",
    name,
    title: null,
    twitter: null,
    type: null,
    representative: null,
    motivation: null,
    experience: null,
    skills: null,
    projects: null,
    country: null,
  };
}

function session(subject = SIGNER): MeResponse {
  return {
    address: SIGNER,
    effectiveAddress: subject,
    actingAs: subject === SIGNER ? null : subject,
    profile: {
      name: null,
      bio: null,
      picture: null,
      twitter: null,
      discourseUsername: null,
      discourseProfileLink: null,
      statement: null,
      isSeekingDelegation: null,
      issues: null,
      sources: {
        name: null,
        bio: null,
        picture: null,
        twitter: null,
        discourseUsername: null,
        discourseProfileLink: null,
        statement: null,
        isSeekingDelegation: null,
        issues: null,
      },
    },
    ownedFields: [],
    safes: [],
  };
}

function owned(current: CandidateProfileVersion | null): MyCandidateProfile {
  return {
    current,
    versions: current
      ? [{ version: current.version, createdAt: current.createdAt }]
      : [],
  };
}

let client: QueryClient;
function Wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
function editor() {
  return render(<CandidateProfilePage />, { wrapper: Wrapper });
}
function nameInput(view: ReturnType<typeof editor>) {
  return view.getByLabelText("Name") as HTMLInputElement;
}

beforeEach(() => {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  mocks.useAccount.mockReturnValue({ address: SIGNER, isConnected: true });
  client.setQueryData(siweKeys.me, session());
  client.setQueryData(siweKeys.elections, [PREVIOUS, ELECTION]);
  client.setQueryData(
    siweKeys.candidateProfile(SIGNER, ELECTION.id),
    owned(profile())
  );
  vi.spyOn(siweApi, "me").mockResolvedValue(session());
  vi.spyOn(siweApi, "listElections").mockResolvedValue([PREVIOUS, ELECTION]);
  vi.spyOn(siweApi, "getMyCandidateProfile").mockResolvedValue(
    owned(profile())
  );
});

afterEach(() => {
  cleanup();
  client.clear();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("candidate editor identity and hydration", () => {
  it("shows candidate-specific connection guidance while signed out", () => {
    mocks.useAccount.mockReturnValue({
      address: undefined,
      isConnected: false,
    });
    const view = editor();

    expect(
      view.getByText(
        "Connect your wallet to sign in and publish your candidate profile."
      )
    ).toBeDefined();
    expect(view.queryByLabelText("Name")).toBeNull();
    expect(siweApi.getMyCandidateProfile).not.toHaveBeenCalled();
  });

  it("loads a cached Safe profile when the effective subject changes without signing out", async () => {
    client.setQueryData(
      siweKeys.candidateProfile(SAFE, ELECTION.id),
      owned(profile(SAFE, "Safe profile"))
    );
    const save = vi
      .spyOn(siweApi, "putCandidateProfile")
      .mockResolvedValue(profile(SAFE, "Safe profile"));
    const view = editor();
    fireEvent.change(nameInput(view), {
      target: { value: "Unsaved signer edits" },
    });

    act(() => {
      client.setQueryData(siweKeys.me, session(SAFE));
    });
    await waitFor(() =>
      expect(view.getByTestId("candidate-subject").textContent).toContain(SAFE)
    );
    expect(nameInput(view).value).toBe("Safe profile");

    fireEvent.click(view.getByTestId("candidate-save"));
    await waitFor(() =>
      expect(save).toHaveBeenCalledWith(
        ELECTION.id,
        expect.objectContaining({ name: "Safe profile" })
      )
    );
  });

  it("waits for an uncached subject's profile before mounting its form", async () => {
    let finish!: (data: MyCandidateProfile) => void;
    vi.mocked(siweApi.getMyCandidateProfile).mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const view = editor();

    act(() => {
      client.setQueryData(siweKeys.me, session(SAFE));
    });
    await waitFor(() =>
      expect(siweApi.getMyCandidateProfile).toHaveBeenCalledOnce()
    );
    expect(view.queryByLabelText("Name")).toBeNull();

    await act(async () => {
      finish(owned(profile(SAFE, "Loaded Safe")));
    });
    await waitFor(() => expect(nameInput(view).value).toBe("Loaded Safe"));
  });

  it("preserves unsaved edits when the same subject's stored profile refreshes", async () => {
    const view = editor();
    fireEvent.change(nameInput(view), { target: { value: "Unsaved edits" } });
    vi.mocked(siweApi.getMyCandidateProfile).mockResolvedValue(
      owned(profile(SIGNER, "Server update"))
    );

    await act(async () => {
      await client.invalidateQueries({
        queryKey: siweKeys.candidateProfile(SIGNER, ELECTION.id),
      });
    });

    expect(nameInput(view).value).toBe("Unsaved edits");
  });

  it("resets to the selected election's cached profile and makes closed elections read-only", () => {
    client.setQueryData(
      siweKeys.candidateProfile(SIGNER, PREVIOUS.id),
      owned(profile(SIGNER, "Historical profile", PREVIOUS.id))
    );
    const save = vi.spyOn(siweApi, "putCandidateProfile");
    const view = editor();
    fireEvent.change(nameInput(view), { target: { value: "Current edits" } });

    fireEvent.click(view.getByRole("button", { name: "Cohort 0" }));

    expect(nameInput(view).value).toBe("Historical profile");
    expect(nameInput(view).disabled).toBe(true);
    expect(
      (view.getByTestId("candidate-save") as HTMLButtonElement).disabled
    ).toBe(true);
    fireEvent.click(view.getByTestId("candidate-save"));
    expect(save).not.toHaveBeenCalled();
  });
});

describe("candidate profile saves", () => {
  it("requires a name and serializes fields while disabling edits during a save", async () => {
    let finish!: (data: CandidateProfileVersion) => void;
    const save = vi.spyOn(siweApi, "putCandidateProfile").mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const view = editor();
    fireEvent.change(nameInput(view), { target: { value: "   " } });
    fireEvent.click(view.getByTestId("candidate-save"));
    expect(mocks.toastError).toHaveBeenCalledWith("A name is required.");
    expect(save).not.toHaveBeenCalled();

    fireEvent.change(nameInput(view), { target: { value: "  New name  " } });
    fireEvent.change(view.getByLabelText("Title"), {
      target: { value: "   " },
    });
    fireEvent.change(view.getByLabelText("Skills"), {
      target: { value: " Solidity, , Incident response " },
    });
    fireEvent.click(view.getByTestId("candidate-save"));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(save).toHaveBeenCalledWith(
      ELECTION.id,
      expect.objectContaining({
        name: "New name",
        title: null,
        skills: ["Solidity", "Incident response"],
      })
    );
    await waitFor(() => expect(nameInput(view).disabled).toBe(true));

    await act(async () => {
      finish({ ...profile(SIGNER, "New name"), version: 2 });
    });
    await waitFor(() =>
      expect(mocks.toastSuccess).toHaveBeenCalledWith("Saved as version 2.")
    );
    expect(nameInput(view).disabled).toBe(false);
  });

  it("keeps edits and shows the save error when the server rejects a write", async () => {
    vi.spyOn(siweApi, "putCandidateProfile").mockRejectedValue(
      new Error("This election has closed.")
    );
    const view = editor();
    fireEvent.change(nameInput(view), {
      target: { value: "Keep these edits" },
    });

    fireEvent.click(view.getByTestId("candidate-save"));

    await waitFor(() =>
      expect(view.getByTestId("candidate-save-error").textContent).toContain(
        "This election has closed."
      )
    );
    expect(nameInput(view).value).toBe("Keep these edits");
    expect(nameInput(view).disabled).toBe(false);
  });

  it.each(["existing profile", "first publication"])(
    "refreshes the cached public view after a save: %s",
    async (scenario) => {
      const before =
        scenario === "existing profile" ? profile(SIGNER, "Before") : null;
      const after = { ...profile(SIGNER, "After"), version: 2 };
      client.setQueryData(
        siweKeys.publicCandidateProfile(ELECTION.id, SIGNER),
        before
      );
      vi.spyOn(siweApi, "putCandidateProfile").mockResolvedValue(after);
      const readPublic = vi
        .spyOn(siweApi, "getPublicCandidateProfile")
        .mockResolvedValue(after);
      const { result } = renderHook(
        () => ({
          mine: useCandidateProfile(ELECTION.id),
          public: usePublicCandidateProfile(ELECTION.id, SIGNER),
        }),
        { wrapper: Wrapper }
      );
      expect(result.current.public.data).toEqual(before);

      await act(async () => {
        await result.current.mine.save(after);
      });

      await waitFor(() =>
        expect(result.current.public.data?.name).toBe("After")
      );
      expect(readPublic).toHaveBeenCalledWith(ELECTION.id, SIGNER);
    }
  );

  it("refreshes the saved subject's caches when the session changes during a pending save", async () => {
    const saved = { ...profile(SIGNER, "Saved for signer"), version: 2 };
    let finish!: (data: CandidateProfileVersion) => void;
    vi.spyOn(siweApi, "putCandidateProfile").mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    client.setQueryData(
      siweKeys.candidateProfile(SAFE, ELECTION.id),
      owned(profile(SAFE, "Safe profile"))
    );
    client.setQueryData(
      siweKeys.publicCandidateProfile(ELECTION.id, SIGNER),
      null
    );
    client.setQueryData(
      siweKeys.publicCandidateProfile(ELECTION.id, SAFE),
      null
    );
    const { result } = renderHook(() => useCandidateProfile(ELECTION.id), {
      wrapper: Wrapper,
    });
    let pending!: Promise<CandidateProfileVersion>;
    act(() => {
      pending = result.current.save(saved);
    });
    await waitFor(() =>
      expect(siweApi.putCandidateProfile).toHaveBeenCalledOnce()
    );
    act(() => {
      client.setQueryData(siweKeys.me, session(SAFE));
    });
    await waitFor(() => expect(result.current.current?.address).toBe(SAFE));

    await act(async () => {
      finish(saved);
      await pending;
    });

    expect(
      client.getQueryState(siweKeys.candidateProfile(SIGNER, ELECTION.id))
        ?.isInvalidated
    ).toBe(true);
    expect(
      client.getQueryState(siweKeys.publicCandidateProfile(ELECTION.id, SIGNER))
        ?.isInvalidated
    ).toBe(true);
    expect(
      client.getQueryState(siweKeys.candidateProfile(SAFE, ELECTION.id))
        ?.isInvalidated
    ).toBe(false);
    expect(
      client.getQueryState(siweKeys.publicCandidateProfile(ELECTION.id, SAFE))
        ?.isInvalidated
    ).toBe(false);
  });
});
