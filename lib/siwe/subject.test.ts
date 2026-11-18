import { describe, expect, it } from "vitest";

import { sessionSubject } from "@/lib/siwe/subject";

const SIGNER = "0x1111111111111111111111111111111111111111";
const SAFE = "0x2222222222222222222222222222222222222222";

describe("sessionSubject", () => {
  it("is null when signed out", () => {
    expect(sessionSubject(null)).toBeNull();
  });

  it("uses effectiveAddress from an indexer that supports act-as", () => {
    expect(sessionSubject({ address: SIGNER, effectiveAddress: SAFE })).toBe(
      SAFE
    );
  });

  it("falls back to address when the indexer no longer sends effectiveAddress", () => {
    expect(sessionSubject({ address: SIGNER })).toBe(SIGNER);
  });
});
