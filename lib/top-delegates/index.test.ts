import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DelegateInfo } from "@gzeoneth/gov-tracker";

import { EXCLUDED_DELEGATE_ADDRESSES } from "@/config/delegates";

import {
  chunkAddresses,
  fetchTopDelegatesSnapshot,
  rankDelegateCandidates,
} from "./index";

const ARB = (whole: number) => `${whole}000000000000000000`;

function row(address: string, votingPower: string): DelegateInfo {
  return {
    address: address as `0x${string}`,
    votingPower,
    lastChangeBlock: 1,
  };
}

const A = "0xAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAa";
const B = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const C = "0xcccccccccccccccccccccccccccccccccccccccc";

describe("rankDelegateCandidates", () => {
  it("re-ranks on live power and overrides the listed value", () => {
    const candidates = [row(A, ARB(10_000)), row(B, ARB(9_000))];
    const live = new Map([
      [A.toLowerCase(), ARB(6_000)],
      [B.toLowerCase(), ARB(20_000)],
    ]);

    const ranked = rankDelegateCandidates(candidates, live, 100);

    expect(ranked.map((d) => [d.address, d.votingPower])).toEqual([
      [B, ARB(20_000)],
      [A, ARB(6_000)],
    ]);
  });

  it("drops a candidate without a live reading rather than showing its listed power", () => {
    const candidates = [row(A, ARB(10_000)), row(B, ARB(9_000))];
    const live = new Map([[B.toLowerCase(), ARB(12_000)]]);

    const ranked = rankDelegateCandidates(candidates, live, 100);

    expect(ranked.map((d) => [d.address, d.votingPower])).toEqual([
      [B, ARB(12_000)],
    ]);
  });

  it("returns nothing when no candidate has a live reading", () => {
    const candidates = [row(A, ARB(10_000)), row(B, ARB(9_000))];

    expect(rankDelegateCandidates(candidates, new Map(), 100)).toEqual([]);
  });

  it("drops candidates that fell below the app threshold", () => {
    const candidates = [row(A, ARB(10_000)), row(B, ARB(9_000))];
    const live = new Map([
      [A.toLowerCase(), ARB(4_999)],
      [B.toLowerCase(), ARB(9_000)],
    ]);

    const ranked = rankDelegateCandidates(candidates, live, 100);

    expect(ranked.map((d) => d.address)).toEqual([B]);
  });

  it("keeps a candidate sitting exactly on the threshold", () => {
    const live = new Map([[A.toLowerCase(), ARB(5_000)]]);

    const ranked = rankDelegateCandidates([row(A, ARB(4_000))], live, 100);

    expect(ranked.map((d) => d.address)).toEqual([A]);
  });

  it("drops the governance exclude address regardless of power", () => {
    const excluded = EXCLUDED_DELEGATE_ADDRESSES[0];
    const candidates = [row(excluded, ARB(1_000_000)), row(A, ARB(10_000))];
    const live = new Map([
      [excluded.toLowerCase(), ARB(1_000_000)],
      [A.toLowerCase(), ARB(10_000)],
    ]);

    const ranked = rankDelegateCandidates(candidates, live, 100);

    expect(ranked.map((d) => d.address)).toEqual([A]);
  });

  it("caps the result at the limit after re-ranking", () => {
    const candidates = [
      row(A, ARB(10_000)),
      row(B, ARB(9_000)),
      row(C, ARB(8_000)),
    ];
    const live = new Map([
      [A.toLowerCase(), ARB(10_000)],
      [B.toLowerCase(), ARB(9_000)],
      [C.toLowerCase(), ARB(50_000)],
    ]);

    const ranked = rankDelegateCandidates(candidates, live, 2);

    expect(ranked.map((d) => d.address)).toEqual([C, A]);
  });

  it("does not mutate the input", () => {
    const candidates = [row(A, ARB(10_000)), row(B, ARB(9_000))];
    const live = new Map([[B.toLowerCase(), ARB(20_000)]]);

    rankDelegateCandidates(candidates, live, 100);

    expect(candidates[0].votingPower).toBe(ARB(10_000));
    expect(candidates[1].votingPower).toBe(ARB(9_000));
  });
});

describe("chunkAddresses", () => {
  it("splits into fixed-size chunks with a short tail", () => {
    expect(chunkAddresses([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("returns no chunks for an empty list", () => {
    expect(chunkAddresses([], 100)).toEqual([]);
  });
});

describe("fetchTopDelegatesSnapshot", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reads the same-origin route as JSON", async () => {
    const snapshot = {
      delegates: [row(A, ARB(10_000))],
      fetchedAt: "2026-10-30T12:00:00.000Z",
    };
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(snapshot), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );

    await expect(fetchTopDelegatesSnapshot()).resolves.toEqual(snapshot);
    expect(fetchMock).toHaveBeenCalledWith("/api/top-delegates", {
      headers: { accept: "application/json" },
    });
  });

  it("throws with the status on a non-2xx answer", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Indexer upstream error." }), {
        status: 502,
      })
    );

    await expect(fetchTopDelegatesSnapshot()).rejects.toThrow(
      "Top delegates request failed: 502"
    );
  });
});
