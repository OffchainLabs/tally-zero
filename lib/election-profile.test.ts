import { describe, expect, it } from "vitest";

import type { CandidateProfileVersion } from "@/lib/siwe/types";
import type { TallyElectionCandidate } from "@/lib/tally-data/types";
import {
  electionsNewestFirst,
  latestElectionId,
  resolveCandidate,
  toTwitterHandle,
  toTwitterUrl,
} from "./election-profile";

const ADDRESS = "0x358E76A0C6224dCABCe39ff395b284e7da9bf413";

const staticCandidate = (
  overrides: Partial<TallyElectionCandidate> = {}
): TallyElectionCandidate => ({
  address: ADDRESS,
  name: "Static Name",
  title: "Static Title",
  twitter: "https://twitter.com/static_handle",
  type: "individual",
  representative: null,
  motivation: "Static motivation",
  experience: null,
  // The real export stores a ratings object here, not a string list.
  skills: { canVerifySigning: true, solidity: 10, rust: 8 },
  projects: null,
  country: "Brazil",
  registeredAt: null,
  message: null,
  signatureHash: null,
  ...overrides,
});

const selfProfile = (
  overrides: Partial<CandidateProfileVersion> = {}
): CandidateProfileVersion => ({
  address: ADDRESS,
  electionId: "0xgov:7",
  version: 2,
  createdAt: "2026-05-01T00:00:00Z",
  name: "Self Name",
  title: null,
  twitter: null,
  type: null,
  representative: null,
  motivation: null,
  experience: null,
  skills: null,
  projects: null,
  country: null,
  ...overrides,
});

describe("toTwitterHandle", () => {
  it("accepts a bare handle, with or without the @", () => {
    expect(toTwitterHandle("foo_Bar1")).toBe("foo_Bar1");
    expect(toTwitterHandle("  @foo  ")).toBe("foo");
  });

  // The static export stores profile URLs, and candidates paste them too.
  it("takes the handle from an X or Twitter profile URL", () => {
    expect(toTwitterHandle("https://twitter.com/foo")).toBe("foo");
    expect(toTwitterHandle("https://www.x.com/foo/status/123")).toBe("foo");
    expect(toTwitterHandle("https://mobile.twitter.com/foo?s=21")).toBe("foo");
  });

  // The value can be self-authored, and it renders behind an X icon.
  it("rejects a URL whose host is not X", () => {
    expect(toTwitterHandle("https://evil.example/foo")).toBeNull();
    expect(toTwitterHandle("https://x.com@evil.example/foo")).toBeNull();
    expect(toTwitterHandle("https://x.com.evil.example/foo")).toBeNull();
  });

  it("rejects anything that is not a valid handle", () => {
    expect(toTwitterHandle("two words")).toBeNull();
    expect(toTwitterHandle("foo/../bar")).toBeNull();
    expect(toTwitterHandle("a".repeat(16))).toBeNull();
    expect(toTwitterHandle("https://x.com/")).toBeNull();
    expect(toTwitterHandle("@")).toBeNull();
  });

  it("treats blank as absent", () => {
    expect(toTwitterHandle("   ")).toBeNull();
    expect(toTwitterHandle(null)).toBeNull();
  });
});

describe("toTwitterUrl", () => {
  // The link is always rebuilt from the handle, never passed through.
  it("builds an x.com link from a handle or a profile URL", () => {
    expect(toTwitterUrl("@foo")).toBe("https://x.com/foo");
    expect(toTwitterUrl("https://twitter.com/foo")).toBe("https://x.com/foo");
  });

  it("returns null when there is no handle", () => {
    expect(toTwitterUrl("https://evil.example/foo")).toBeNull();
    expect(toTwitterUrl(null)).toBeNull();
  });
});

describe("resolveCandidate", () => {
  it("prefers a self-authored field and records the source", () => {
    const { candidate, sources } = resolveCandidate(
      ADDRESS,
      staticCandidate(),
      selfProfile()
    );

    expect(candidate.name).toBe("Self Name");
    expect(sources.name).toBe("self");
    // Not overridden by the profile, so the snapshot still shows.
    expect(candidate.title).toBe("Static Title");
    expect(sources.title).toBe("static");
  });

  // A candidate who clears a field should not end up with a blank name; the
  // snapshot is the floor, not something a blank string can erase.
  it("ignores an empty self-authored value", () => {
    const { candidate, sources } = resolveCandidate(
      ADDRESS,
      staticCandidate(),
      selfProfile({ name: "   " })
    );

    expect(candidate.name).toBe("Static Name");
    expect(sources.name).toBe("static");
  });

  // Same floor for a Twitter value that holds no handle: it must not erase the
  // export's link or be credited to the candidate.
  it("ignores a self-authored Twitter value that is not a handle", () => {
    const { candidate, sources, hasSelfAuthored } = resolveCandidate(
      ADDRESS,
      staticCandidate(),
      selfProfile({ name: "   ", twitter: "https://linktr.ee/me" })
    );

    expect(candidate.twitter).toBe("https://x.com/static_handle");
    expect(sources.twitter).toBe("static");
    expect(hasSelfAuthored).toBe(false);
  });

  // The whole reason skills is excluded from the merge.
  it("keeps the static ratings object and exposes SIWE skills separately", () => {
    const { candidate, selfReportedSkills } = resolveCandidate(
      ADDRESS,
      staticCandidate(),
      selfProfile({ skills: ["Solidity", "Incident response"] })
    );

    expect(candidate.skills).toEqual({
      canVerifySigning: true,
      solidity: 10,
      rust: 8,
    });
    expect(selfReportedSkills).toEqual(["Solidity", "Incident response"]);
  });

  it("synthesizes a record for an address absent from the static export", () => {
    const { candidate, hasSelfAuthored } = resolveCandidate(
      ADDRESS,
      null,
      selfProfile({ country: "Portugal" })
    );

    expect(candidate.address).toBe(ADDRESS);
    expect(candidate.name).toBe("Self Name");
    expect(candidate.country).toBe("Portugal");
    expect(candidate.skills).toBeNull();
    expect(hasSelfAuthored).toBe(true);
  });

  it("dedupes self-reported skills", () => {
    const { selfReportedSkills } = resolveCandidate(
      ADDRESS,
      staticCandidate(),
      selfProfile({ skills: ["Rust", "Solidity", "Rust"] })
    );

    expect(selfReportedSkills).toEqual(["Rust", "Solidity"]);
  });

  it("is a no-op when there is no self-authored profile", () => {
    const base = staticCandidate();
    const { candidate, hasSelfAuthored } = resolveCandidate(
      ADDRESS,
      base,
      null
    );

    expect(hasSelfAuthored).toBe(false);
    expect(candidate.name).toBe(base.name);
  });

  it("normalizes the static twitter URL either way", () => {
    const fromHandle = resolveCandidate(
      ADDRESS,
      staticCandidate({ twitter: null }),
      selfProfile({ twitter: "@handle" })
    );
    expect(fromHandle.candidate.twitter).toBe("https://x.com/handle");

    const fromStatic = resolveCandidate(ADDRESS, staticCandidate(), null);
    expect(fromStatic.candidate.twitter).toBe("https://x.com/static_handle");
  });
});

describe("latestElectionId", () => {
  it("picks the most recently started election", () => {
    expect(
      latestElectionId([
        { id: "old", startedAt: "2025-01-01T00:00:00Z" },
        { id: "new", startedAt: "2026-01-01T00:00:00Z" },
      ])
    ).toBe("new");
  });

  it("returns null with nothing to pick from", () => {
    expect(latestElectionId([])).toBeNull();
  });
});

describe("electionsNewestFirst", () => {
  it("orders by start date, newest first, without mutating the input", () => {
    const elections = [
      { id: "a", startedAt: "2025-09-01T00:00:00Z" },
      { id: "c", startedAt: "2027-03-01T00:00:00Z" },
      { id: "b", startedAt: "2026-09-01T00:00:00Z" },
    ];

    expect(electionsNewestFirst(elections).map((e) => e.id)).toEqual([
      "c",
      "b",
      "a",
    ]);
    expect(elections.map((e) => e.id)).toEqual(["a", "c", "b"]);
  });
});
