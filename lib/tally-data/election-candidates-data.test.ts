import { describe, expect, it } from "vitest";

import electionCandidates from "@/data/election-candidates.json";
import { electionIndexForRegistration } from "@/lib/election-profile";
import { MAINNET_ELECTIONS } from "@/lib/election-profile.fixtures";

type Record = { registered_at?: string | null; electionIndex?: number | null };
const records = Object.entries(
  electionCandidates as unknown as { [address: string]: Record }
);

// The export keeps one record per address (each candidate's latest
// registration); scripts/assign-candidate-elections.ts stamps which election it
// was for. These pin that stamp to the rule the pages use.
describe("data/election-candidates.json", () => {
  it("places every record in the election its registration date names", () => {
    for (const [address, record] of records) {
      expect(
        record.electionIndex,
        `${address} registered ${record.registered_at}`
      ).toBe(
        electionIndexForRegistration(
          record.registered_at ?? null,
          MAINNET_ELECTIONS
        )
      );
    }
  });

  it("spreads the 154 registrations across the six elections", () => {
    const counts: { [key: string]: number } = {};
    for (const [, record] of records) {
      const key = String(record.electionIndex);
      counts[key] = (counts[key] ?? 0) + 1;
    }
    expect(records).toHaveLength(154);
    expect(counts).toEqual({
      "0": 36,
      "1": 32,
      "2": 35,
      "3": 15,
      "4": 18,
      "5": 17,
      // One record has no registered_at to place it by.
      null: 1,
    });
  });
});
