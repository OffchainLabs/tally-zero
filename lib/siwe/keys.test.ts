import { describe, expect, it } from "vitest";

import { SAFES_SCOPE, SUBJECT_SCOPE, siweKeys } from "./keys";

const startsWith = (key: readonly unknown[], prefix: readonly unknown[]) =>
  prefix.every((segment, i) => key[i] === segment);

describe("siweKeys", () => {
  // The whole point of the shared prefix: acting-as evicts subject data with a
  // single removeQueries(SUBJECT_SCOPE). A subject-scoped key that forgets to
  // nest under it would silently survive the switch and serve one subject's
  // data to another — so pin the invariant rather than trusting review.
  it("nests every subject-scoped key under SUBJECT_SCOPE", () => {
    const subject = "0xsubject";
    const keys = [
      siweKeys.profile(subject),
      siweKeys.drafts(subject),
      siweKeys.draft(subject, "d1"),
      siweKeys.candidateProfile(subject, "0xgov:7"),
    ];

    for (const key of keys) {
      expect(startsWith(key, SUBJECT_SCOPE)).toBe(true);
      expect(key[SUBJECT_SCOPE.length]).toBe(subject);
    }
  });

  it("keeps a different subject's keys disjoint", () => {
    expect(siweKeys.drafts("0xa")).not.toEqual(siweKeys.drafts("0xb"));
  });

  // An individual draft nests under the list so invalidating the list also
  // refreshes each draft.
  it("nests a single draft under the drafts list", () => {
    const subject = "0xsubject";
    expect(
      startsWith(siweKeys.draft(subject, "d1"), siweKeys.drafts(subject))
    ).toBe(true);
  });

  // /api/auth/safes resolves against the signed-in address, not the effective
  // subject, so acting as a Safe must not move this key.
  it("keeps the Safe list out of the subject scope", () => {
    expect(startsWith(siweKeys.safes("0xsigner"), SUBJECT_SCOPE)).toBe(false);
  });

  // The act-as hook (landing in the next PR in this stack) invalidates
  // SAFES_SCOPE rather than reconstructing a per-signer key, which only works
  // because query keys match by prefix. If the Safe key stopped nesting under
  // the root, that invalidation would silently no-op and a newly remembered Safe
  // would never appear in the switcher.
  it("nests the Safe list under SAFES_SCOPE", () => {
    expect(startsWith(siweKeys.safes("0xsigner"), SAFES_SCOPE)).toBe(true);
  });

  it("keeps public reads free of any identity", () => {
    expect(startsWith(siweKeys.elections, SUBJECT_SCOPE)).toBe(false);
    expect(startsWith(siweKeys.sharedDraft("slug"), SUBJECT_SCOPE)).toBe(false);
  });

  // Addresses arrive checksummed from wagmi and lowercase from the indexer. One
  // subject must never occupy two cache entries, or a write through one leaves
  // the other stale — so the key normalizes casing rather than trusting callers.
  it("keys one address identically whatever its casing", () => {
    expect(siweKeys.profile("0xAbCdEf")).toEqual(siweKeys.profile("0xabcdef"));
    expect(siweKeys.drafts("0xAbCdEf")).toEqual(siweKeys.drafts("0xabcdef"));
    expect(siweKeys.draft("0xAbCdEf", "d1")).toEqual(
      siweKeys.draft("0xabcdef", "d1")
    );
    expect(siweKeys.safes("0xAbCdEf")).toEqual(siweKeys.safes("0xabcdef"));
    expect(siweKeys.publicCandidateProfile("0xgov:7", "0xAbCdEf")).toEqual(
      siweKeys.publicCandidateProfile("0xgov:7", "0xabcdef")
    );
  });

  // The Safe key is built before the session resolves, so the undefined signer
  // has to pass through untouched rather than throw on .toLowerCase().
  it("tolerates an undefined signer", () => {
    expect(() => siweKeys.safes(undefined)).not.toThrow();
    expect(siweKeys.safes(undefined)).toEqual([...SAFES_SCOPE, undefined]);
  });
});
