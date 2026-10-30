import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const indexerFetch = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));
// Pass the function straight through: these tests cover our own wrapper, not
// Next's data cache.
vi.mock("next/cache", () => ({
  unstable_cache: (fn: unknown) => fn,
}));
vi.mock("@/lib/indexer/server", () => ({ indexerFetch }));

const {
  fetchTopDelegatesFromIndexer,
  getCachedTopDelegates,
  resetTopDelegatesMemory,
} = await import("./server");

const A = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const B = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

function indexerRow(address: string, votingPower: string) {
  return {
    address,
    votingPower,
    lastChangeBlock: 7,
    votesCount: votingPower,
    delegatorsCount: 3,
    isPrioritized: false,
    ens: null,
    name: "Someone",
    picture: null,
    knownLabel: null,
    displayName: "Someone",
  };
}

function okResponse(delegates: unknown[]) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ delegates, totalVotingPower: "0", totalSupply: "0" }),
  };
}

describe("fetchTopDelegatesFromIndexer", () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it("asks for the top 300 with the delegates tab's filter", async () => {
    indexerFetch.mockResolvedValueOnce(okResponse([]));

    await fetchTopDelegatesFromIndexer();

    const [path] = indexerFetch.mock.calls[0];
    const search = new URL(`http://x${path}`).searchParams;
    expect(path.startsWith("/api/tally/delegates?")).toBe(true);
    expect(search.get("minVotingPower")).toBe("5000000000000000000000");
    expect(search.get("exclude")).toBe(
      "0x00000000000000000000000000000000000A4B86"
    );
    expect(search.get("limit")).toBe("300");
    expect(search.get("offset")).toBe("0");
    expect(search.get("sort")).toBe("votingPower");
    expect(search.get("dir")).toBe("desc");
  });

  it("keeps only the cache-shape fields", async () => {
    indexerFetch.mockResolvedValueOnce(
      okResponse([indexerRow(A, "1000"), indexerRow(B, "500")])
    );

    const snapshot = await fetchTopDelegatesFromIndexer();

    expect(snapshot.delegates).toEqual([
      { address: A, votingPower: "1000", lastChangeBlock: 7 },
      { address: B, votingPower: "500", lastChangeBlock: 7 },
    ]);
    expect(Date.parse(snapshot.fetchedAt)).not.toBeNaN();
  });

  it("throws on a non-2xx upstream", async () => {
    indexerFetch.mockResolvedValueOnce({ ok: false, status: 500 });

    await expect(fetchTopDelegatesFromIndexer()).rejects.toThrow(
      "Indexer request failed: 500"
    );
  });
});

describe("getCachedTopDelegates", () => {
  beforeEach(() => {
    resetTopDelegatesMemory();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it("serves the last successful list when a later read fails", async () => {
    indexerFetch.mockResolvedValueOnce(okResponse([indexerRow(A, "1000")]));
    const first = await getCachedTopDelegates();

    indexerFetch.mockRejectedValueOnce(new Error("indexer down"));
    const second = await getCachedTopDelegates();

    expect(second).toBe(first);
    expect(second.delegates.map((d) => d.address)).toEqual([A]);
  });

  it("replaces the remembered list on the next successful read", async () => {
    indexerFetch.mockResolvedValueOnce(okResponse([indexerRow(A, "1000")]));
    await getCachedTopDelegates();
    indexerFetch.mockResolvedValueOnce(okResponse([indexerRow(B, "900")]));
    await getCachedTopDelegates();

    indexerFetch.mockRejectedValueOnce(new Error("indexer down"));
    const served = await getCachedTopDelegates();

    expect(served.delegates.map((d) => d.address)).toEqual([B]);
  });

  it("throws when the indexer has never answered", async () => {
    indexerFetch.mockRejectedValueOnce(new Error("indexer down"));

    await expect(getCachedTopDelegates()).rejects.toThrow("indexer down");
  });
});
