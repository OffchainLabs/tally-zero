import { describe, expect, it } from "vitest";

import type {
  TallyDelegateListItem,
  TallyDelegateListResult,
} from "@/lib/tally-data/types";

import {
  buildNotVotedList,
  toDelegateCache,
} from "./use-top-delegates-not-voted";

const DELEGATE_A = "0xAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAa";
const DELEGATE_B = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

function row(
  address: string,
  votingPower: string,
  lastChangeBlock: number
): TallyDelegateListItem {
  return {
    address: address as `0x${string}`,
    votingPower,
    lastChangeBlock,
    votesCount: votingPower,
    delegatorsCount: 0,
    isPrioritized: false,
    ens: null,
    name: null,
    picture: null,
    knownLabel: null,
    displayName: null,
  };
}

function listResult(
  overrides: Partial<TallyDelegateListResult> = {}
): TallyDelegateListResult {
  return {
    delegates: [row(DELEGATE_A, "1000", 10), row(DELEGATE_B, "500", 20)],
    totalVotingPower: "1500",
    totalSupply: "10000",
    ...overrides,
  };
}

describe("toDelegateCache", () => {
  it("carries the indexer rows and totals into the cache shape", () => {
    const cache = toDelegateCache(listResult());

    expect(cache.delegates.map((d) => [d.address, d.votingPower])).toEqual([
      [DELEGATE_A, "1000"],
      [DELEGATE_B, "500"],
    ]);
    expect(cache.totalVotingPower).toBe("1500");
    expect(cache.totalSupply).toBe("10000");
    expect(cache.stats.totalDelegates).toBe(2);
  });

  it("re-sorts rows by voting power descending", () => {
    const cache = toDelegateCache(
      listResult({
        delegates: [row(DELEGATE_B, "500", 20), row(DELEGATE_A, "1000", 10)],
      })
    );

    expect(cache.delegates.map((d) => d.address)).toEqual([
      DELEGATE_A,
      DELEGATE_B,
    ]);
  });

  it("defaults null totals to zero", () => {
    const cache = toDelegateCache(
      listResult({
        totalVotingPower: null as unknown as string,
        totalSupply: null as unknown as string,
      })
    );

    expect(cache.totalVotingPower).toBe("0");
    expect(cache.totalSupply).toBe("0");
  });
});

describe("buildNotVotedList", () => {
  const sdkResults = [
    { address: DELEGATE_A, votingPower: "1000" },
    { address: DELEGATE_B, votingPower: "500" },
  ];

  it("passes voting power through unchanged", () => {
    expect(buildNotVotedList(sdkResults, new Map())).toEqual([
      { address: DELEGATE_A, label: undefined, votingPower: "1000" },
      { address: DELEGATE_B, label: undefined, votingPower: "500" },
    ]);
  });

  it("attaches display labels by lowercase address and converts null to undefined", () => {
    const displayRecords = new Map([
      [DELEGATE_A.toLowerCase(), { label: "Alice" }],
      [DELEGATE_B.toLowerCase(), { label: null }],
    ]);

    const result = buildNotVotedList(sdkResults, displayRecords);

    expect(result[0].label).toBe("Alice");
    expect(result[1].label).toBeUndefined();
  });
});
