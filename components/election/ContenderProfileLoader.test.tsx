// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import registrationSnapshots from "@/data/election-candidate-registration-snapshots.json";
import electionCandidates from "@/data/election-candidates.json";
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
    showVoting = true,
  }: {
    candidate: TallyElectionCandidate | null;
    showVoting?: boolean;
  }) => (
    <div
      data-testid="profile"
      data-type={candidate?.type}
      data-country={candidate?.country}
      data-candidate={JSON.stringify(candidate)}
      data-voting={showVoting}
    >
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

function renderLoader(
  initialCandidate?: TallyElectionCandidate,
  address = ADDRESS,
  registrationSnapshot?: TallyElectionCandidate
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ContenderProfileLoader
        address={address}
        initialCandidate={initialCandidate}
        registrationSnapshot={registrationSnapshot}
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
  it("preserves the original Immunefi submission alongside current membership after a refetch", async () => {
    const address = "0x0cd9e52891A0a48d45b0C61A31086be8361Ef157";
    const currentCandidate: TallyElectionCandidate = {
      ...registered,
      ...electionCandidates[address],
    };
    const originalCandidate: TallyElectionCandidate = {
      ...registered,
      ...registrationSnapshots[address],
      registeredAt: registrationSnapshots[address].registered_at,
    };
    let respond!: (candidate: TallyElectionCandidate) => void;
    getCandidate.mockReturnValue(
      new Promise<TallyElectionCandidate>((resolve) => {
        respond = resolve;
      })
    );
    indexer([], {});

    renderLoader(currentCandidate, address.toLowerCase(), originalCandidate);

    const currentSection = screen.getByRole("region", {
      name: "Current Council membership",
    });
    const originalSection = screen
      .getByText("Original candidate profile — Immunefi")
      .closest("details")!;
    expect(originalSection.open).toBe(false);
    fireEvent.click(
      within(originalSection).getByText("Original candidate profile — Immunefi")
    );
    expect(originalSection.open).toBe(true);
    const currentProfile = within(currentSection).getByTestId("profile");
    const originalProfile = within(originalSection).getByTestId("profile");
    expect(currentProfile.textContent).toContain("Alejandro Munoz-McDonald");
    expect(originalProfile.textContent).toContain("Immunefi|Immunefi");
    expect(originalProfile.getAttribute("data-voting")).toBe("false");
    expect(JSON.parse(originalProfile.getAttribute("data-candidate")!)).toEqual(
      originalCandidate
    );

    await act(async () => {
      respond({
        ...currentCandidate,
        name: "Updated upstream profile",
        motivation: "Later edits to the profile",
        experience: "Later experience",
        skills: null,
      });
    });

    expect(currentProfile.textContent).toContain("Alejandro Munoz-McDonald");
    const historical = JSON.parse(
      originalProfile.getAttribute("data-candidate")!
    );
    expect(historical).toEqual(originalCandidate);
    expect(historical.motivation).toContain(
      "reapply for the September 2025 cohort"
    );
    expect(historical.skills.solidity).toBe(10);
    expect(historical.country).toContain("Company: Global;");
    expect(historical.registeredAt).toBe("2025-09-15T22:25:13.716966Z");
  });

  it("does not show another address's registration snapshot", async () => {
    const address = "0x0cd9e52891A0a48d45b0C61A31086be8361Ef157";
    getCandidate.mockResolvedValue(registered);
    indexer([], {});
    renderLoader(registered, ADDRESS, {
      ...registered,
      ...registrationSnapshots[address],
    });

    await act(async () => {});

    expect(screen.queryByText(/Original candidate profile/)).toBeNull();
    expect(profileText()).toContain("Static Name");
  });

  it("keeps Alejandro's individual profile after a stale indexer response", async () => {
    const address = "0x0cd9e52891A0a48d45b0C61A31086be8361Ef157";
    const currentCandidate: TallyElectionCandidate = {
      ...registered,
      ...electionCandidates[address],
    };
    let respond!: (candidate: TallyElectionCandidate) => void;
    getCandidate.mockReturnValue(
      new Promise<TallyElectionCandidate>((resolve) => {
        respond = resolve;
      })
    );
    indexer([], {});

    renderLoader(currentCandidate, address.toLowerCase());

    expect(profileText()).toBe(
      "Alejandro Munoz-McDonald|null|https://x.com/static_handle"
    );
    expect(screen.getByTestId("profile").getAttribute("data-country")).toBe(
      "Florida, USA"
    );

    await act(async () => {
      respond({
        ...currentCandidate,
        name: "Immunefi",
        title: "Immunefi",
        type: "organization",
        country:
          "Company: Global; Alejandro (Senior Security Researcher & Smart Contract Lead Triager): Florida, USA",
        motivation: "Immunefi would like to reapply for the next cohort.",
        experience: "Immunefi provides security services to major DAOs.",
        skills: {
          canVerifySigning: true,
          solidity: 10,
          rust: 10,
          golang: 10,
          javascript: 10,
          cyberSecurity: "Immunefi protects more than 300 projects.",
        },
        projects: "Immunefi works with hundreds of projects.",
      });
    });

    expect(getCandidate).toHaveBeenCalledWith(address.toLowerCase());
    expect(profileText()).toBe(
      "Alejandro Munoz-McDonald|null|https://x.com/static_handle"
    );
    expect(screen.getByTestId("profile").getAttribute("data-type")).toBe(
      "individual"
    );
    expect(screen.getByTestId("profile").getAttribute("data-country")).toBe(
      "Florida, USA"
    );
    const displayed = JSON.parse(
      screen.getByTestId("profile").getAttribute("data-candidate")!
    );
    expect(displayed.motivation).toContain(
      "nine of the twelve Council members"
    );
    expect(displayed.motivation).toContain("March 2027");
    expect(displayed.experience).toContain("7 September 2026");
    expect(displayed.skills.cyberSecurity).toContain("same signing key");
    expect(displayed.skills).not.toHaveProperty("solidity");
    expect(displayed.projects).toBeNull();
    expect(displayed.address.toLowerCase()).toBe(address.toLowerCase());
    expect(JSON.stringify(displayed)).not.toMatch(/immunefi/i);
  });

  it("lets Alejandro's self-authored fields win over the stale-indexer override", async () => {
    const address = "0x0cd9e52891A0a48d45b0C61A31086be8361Ef157";
    const currentCandidate: TallyElectionCandidate = {
      ...registered,
      ...electionCandidates[address],
    };
    getCandidate.mockResolvedValue({
      ...currentCandidate,
      name: "Immunefi",
      title: "Immunefi",
      type: "organization",
      country: "Company: Global",
      motivation: "Immunefi would like to reapply for the next cohort.",
    });
    indexer([COHORT_6], {
      [COHORT_6.id]: selfProfile(COHORT_6, {
        address: address.toLowerCase(),
        motivation: "Written by Alejandro himself.",
      }),
    });

    renderLoader(currentCandidate, address.toLowerCase());

    await waitFor(() =>
      expect(screen.getByTestId("candidate-self-fields")).toBeTruthy()
    );
    const displayed = JSON.parse(
      screen.getByTestId("profile").getAttribute("data-candidate")!
    );
    expect(displayed.name).toBe("Self Name");
    expect(displayed.motivation).toBe("Written by Alejandro himself.");
    // Fields Alejandro has not written still come from the static profile,
    // not the stale indexer record.
    expect(displayed.type).toBe("individual");
    expect(displayed.country).toBe("Florida, USA");
    expect(displayed.experience).toContain("7 September 2026");
    expect(screen.getByTestId("candidate-self-fields").textContent).toMatch(
      /Motivation/
    );
  });

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
