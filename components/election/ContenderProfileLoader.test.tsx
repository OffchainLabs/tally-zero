// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SiweApiError } from "@/lib/siwe/client";
import type {
  CandidateProfileVersion,
  ElectionSummary,
} from "@/lib/siwe/types";
import type { TallyElectionCandidate } from "@/lib/tally-data/types";

import { ContenderProfileLoader } from "./ContenderProfileLoader";

const api = vi.hoisted(() => ({
  listElections: vi.fn(),
  getPublicCandidateProfile: vi.fn(),
}));
const getCandidate = vi.hoisted(() => vi.fn());

// The indexer is the boundary: the real hooks run against this fake client.
vi.mock("@/lib/siwe/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/siwe/client")>()),
  siweApi: api,
}));
vi.mock("@/lib/election-utils", () => ({ getCandidate }));

// The renderer is out of scope here; the stub shows what the loader handed it.
vi.mock("@/components/election/ContenderProfile", () => ({
  ContenderProfile: ({
    candidate,
  }: {
    candidate: TallyElectionCandidate | null;
  }) => (
    <div data-testid="profile">
      {candidate
        ? `${candidate.name}|${candidate.title}|${candidate.twitter}`
        : "fallback"}
    </div>
  ),
}));

const ADDRESS = "0x358E76A0C6224dCABCe39ff395b284e7da9bf413";

const COHORT_5: ElectionSummary = {
  id: "0xgov:5",
  cohort: 5,
  status: "complete",
  startedAt: "2026-09-15T00:00:00Z",
  closedAt: "2027-02-01T00:00:00Z",
};
const COHORT_6: ElectionSummary = {
  id: "0xgov:6",
  cohort: 6,
  status: "upcoming",
  startedAt: "2027-03-15T00:00:00Z",
  closedAt: null,
};

const registered: TallyElectionCandidate = {
  address: ADDRESS,
  name: "Static Name",
  title: "Static Title",
  twitter: "https://x.com/static_handle",
  type: null,
  representative: null,
  motivation: null,
  experience: null,
  skills: null,
  projects: null,
  country: null,
  registeredAt: null,
  message: null,
  signatureHash: null,
};

const selfProfile = (
  election: ElectionSummary,
  overrides: Partial<CandidateProfileVersion> = {}
): CandidateProfileVersion => ({
  address: ADDRESS.toLowerCase(),
  electionId: election.id,
  version: 1,
  createdAt: "2026-10-01T00:00:00Z",
  name: "Self Name",
  title: `Cohort ${election.cohort} title`,
  twitter: "self_handle",
  type: null,
  representative: null,
  motivation: null,
  experience: null,
  skills: null,
  projects: null,
  country: null,
  ...overrides,
});

/** Serve `elections`, and a profile only for the elections listed in `profiles`. */
function indexer(
  elections: ElectionSummary[],
  profiles: Record<string, CandidateProfileVersion | Promise<never>>
) {
  api.listElections.mockResolvedValue(elections);
  api.getPublicCandidateProfile.mockImplementation((electionId: string) =>
    electionId in profiles
      ? Promise.resolve(profiles[electionId])
      : Promise.resolve(null)
  );
}

/** Cohort 6 (newest) rejects with `error`; cohort 5 has a profile. */
function failNewest(error: Error) {
  api.listElections.mockResolvedValue([COHORT_5, COHORT_6]);
  api.getPublicCandidateProfile.mockImplementation((electionId: string) =>
    electionId === COHORT_6.id
      ? Promise.reject(error)
      : Promise.resolve(selfProfile(COHORT_5))
  );
}

function renderLoader(initialCandidate?: TallyElectionCandidate) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ContenderProfileLoader
        address={ADDRESS}
        initialCandidate={initialCandidate}
      />
    </QueryClientProvider>
  );
}

const profileText = () => screen.getByTestId("profile").textContent;

beforeEach(() => {
  api.listElections.mockReset();
  api.getPublicCandidateProfile.mockReset();
  getCandidate.mockReset();
});

afterEach(cleanup);

describe("ContenderProfileLoader overlay", () => {
  it("overlays a registered candidate's own profile and attributes it", async () => {
    getCandidate.mockResolvedValue(registered);
    indexer([COHORT_6], { [COHORT_6.id]: selfProfile(COHORT_6) });

    renderLoader(registered);

    await waitFor(() =>
      expect(profileText()).toBe(
        "Self Name|Cohort 6 title|https://x.com/self_handle"
      )
    );
    expect(screen.getByText("Updated by the candidate")).toBeTruthy();
    expect(screen.getByTestId("candidate-self-fields").textContent).toContain(
      "Name, Title, Twitter"
    );
    expect(screen.getByTestId("candidate-profile-election").textContent).toBe(
      "From their cohort 6 candidate profile."
    );
    expect(screen.queryByTestId("candidate-unverified")).toBeNull();
  });

  // The bug this hook exists for: a new election must not hide older edits.
  it("keeps showing an older election's profile after a newer election starts", async () => {
    getCandidate.mockResolvedValue(registered);
    indexer([COHORT_5, COHORT_6], { [COHORT_5.id]: selfProfile(COHORT_5) });

    renderLoader(registered);

    await waitFor(() =>
      expect(profileText()).toBe(
        "Self Name|Cohort 5 title|https://x.com/self_handle"
      )
    );
    expect(screen.getByTestId("candidate-profile-election").textContent).toBe(
      "From their cohort 5 candidate profile (election closed)."
    );
  });

  it("prefers the newest election's profile when several exist", async () => {
    getCandidate.mockResolvedValue(registered);
    indexer([COHORT_5, COHORT_6], {
      [COHORT_5.id]: selfProfile(COHORT_5),
      [COHORT_6.id]: selfProfile(COHORT_6),
    });

    renderLoader(registered);

    await waitFor(() =>
      expect(profileText()).toBe(
        "Self Name|Cohort 6 title|https://x.com/self_handle"
      )
    );
  });

  it("does not show an older profile while a newer election is still loading", async () => {
    getCandidate.mockResolvedValue(registered);
    indexer([COHORT_5, COHORT_6], {
      [COHORT_5.id]: selfProfile(COHORT_5),
      [COHORT_6.id]: new Promise<never>(() => {}),
    });

    renderLoader(registered);

    await waitFor(() =>
      expect(api.getPublicCandidateProfile).toHaveBeenCalledTimes(2)
    );
    await act(async () => {});
    expect(profileText()).toBe(
      "Static Name|Static Title|https://x.com/static_handle"
    );
    expect(screen.queryByText("Updated by the candidate")).toBeNull();
  });

  // The hook sets its own retry, which overrides the client's retry: false, so
  // these run against the real retry rule.
  it("retries a failed newest lookup once, then falls back to an older profile", async () => {
    getCandidate.mockResolvedValue(registered);
    failNewest(new Error("indexer down"));
    const cohort6Calls = () =>
      api.getPublicCandidateProfile.mock.calls.filter(
        ([id]) => id === COHORT_6.id
      ).length;

    renderLoader(registered);

    await waitFor(() => expect(cohort6Calls()).toBe(1));
    // Still held back while the one retry is pending.
    expect(profileText()).toBe(
      "Static Name|Static Title|https://x.com/static_handle"
    );
    await waitFor(
      () =>
        expect(profileText()).toBe(
          "Self Name|Cohort 5 title|https://x.com/self_handle"
        ),
      { timeout: 3000 }
    );
    expect(cohort6Calls()).toBe(2);
  });

  it("falls back at once when the newest lookup fails with a client error", async () => {
    getCandidate.mockResolvedValue(registered);
    failNewest(new SiweApiError(403, "forbidden", "Forbidden"));
    const start = Date.now();

    renderLoader(registered);

    await waitFor(() =>
      expect(profileText()).toBe(
        "Self Name|Cohort 5 title|https://x.com/self_handle"
      )
    );
    // Well under the 1s retry delay.
    expect(Date.now() - start).toBeLessThan(900);
    expect(
      api.getPublicCandidateProfile.mock.calls.filter(
        ([id]) => id === COHORT_6.id
      )
    ).toHaveLength(1);
  });

  it("warns when the author is not in the candidate registry", async () => {
    getCandidate.mockResolvedValue(null);
    indexer([COHORT_6], { [COHORT_6.id]: selfProfile(COHORT_6) });

    renderLoader();

    await waitFor(() =>
      expect(screen.getByTestId("candidate-unverified")).toBeTruthy()
    );
    expect(screen.getByText("Self-published profile")).toBeTruthy();
  });

  it("drops a self-authored link that does not point at X", async () => {
    getCandidate.mockResolvedValue(null);
    indexer([COHORT_6], {
      [COHORT_6.id]: selfProfile(COHORT_6, {
        twitter: "https://evil.example/x",
      }),
    });

    renderLoader();

    await waitFor(() =>
      expect(profileText()).toBe("Self Name|Cohort 6 title|null")
    );
  });

  it("leaves the renderer's own fallback when neither source has data", async () => {
    getCandidate.mockResolvedValue(null);
    indexer([COHORT_5, COHORT_6], {});

    renderLoader();

    await waitFor(() =>
      expect(api.getPublicCandidateProfile).toHaveBeenCalledTimes(2)
    );
    await waitFor(() => expect(profileText()).toBe("fallback"));
    expect(screen.queryByTestId("candidate-unverified")).toBeNull();
  });

  it("shows no notice when the candidate has not authored anything", async () => {
    getCandidate.mockResolvedValue(registered);
    indexer([COHORT_5, COHORT_6], {});

    renderLoader(registered);

    await waitFor(() =>
      expect(api.getPublicCandidateProfile).toHaveBeenCalledTimes(2)
    );
    await act(async () => {});
    expect(profileText()).toBe(
      "Static Name|Static Title|https://x.com/static_handle"
    );
    expect(screen.queryByText("Updated by the candidate")).toBeNull();
  });
});
