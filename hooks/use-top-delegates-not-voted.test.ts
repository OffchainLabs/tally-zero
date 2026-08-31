import { describe, expect, it } from "vitest";

import { buildNotVotedList } from "./use-top-delegates-not-voted";

const DELEGATE_A = "0xAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAa";
const DELEGATE_B = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

const sdkResults = [
  { address: DELEGATE_A, votingPower: "1000" },
  { address: DELEGATE_B, votingPower: "500" },
];

describe("buildNotVotedList", () => {
  it("prefers live on-chain voting power over the cached SDK value", () => {
    const livePowers = new Map([
      [DELEGATE_A.toLowerCase(), "1200"],
      [DELEGATE_B.toLowerCase(), "300"],
    ]);

    expect(buildNotVotedList(sdkResults, livePowers, new Map())).toEqual([
      { address: DELEGATE_A, label: undefined, votingPower: "1200" },
      { address: DELEGATE_B, label: undefined, votingPower: "300" },
    ]);
  });

  it("falls back to the cached value for addresses the refresh omitted", () => {
    const livePowers = new Map([[DELEGATE_B.toLowerCase(), "300"]]);

    expect(buildNotVotedList(sdkResults, livePowers, new Map())).toEqual([
      { address: DELEGATE_A, label: undefined, votingPower: "1000" },
      { address: DELEGATE_B, label: undefined, votingPower: "300" },
    ]);
  });

  it("keeps every cached value when the refresh returned nothing", () => {
    expect(buildNotVotedList(sdkResults, new Map(), new Map())).toEqual([
      { address: DELEGATE_A, label: undefined, votingPower: "1000" },
      { address: DELEGATE_B, label: undefined, votingPower: "500" },
    ]);
  });

  it("attaches display labels and converts null labels to undefined", () => {
    const displayRecords = new Map([
      [DELEGATE_A.toLowerCase(), { label: "Alice" }],
      [DELEGATE_B.toLowerCase(), { label: null }],
    ]);

    const result = buildNotVotedList(sdkResults, new Map(), displayRecords);

    expect(result[0].label).toBe("Alice");
    expect(result[1].label).toBeUndefined();
  });
});
