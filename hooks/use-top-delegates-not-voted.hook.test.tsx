// @vitest-environment jsdom
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  queryDelegatesNotVoted,
  queryDelegateVotingPowers,
  type DelegateCache,
  type DelegateInfo,
} from "@gzeoneth/gov-tracker";

import { loadDelegateCache } from "@/lib/delegate-cache";
import { createRpcProvider } from "@/lib/rpc-utils";
import { getTallyDataClient } from "@/lib/tally-data/client";
import type { TallyDelegateListItem } from "@/lib/tally-data/types";
import { fetchTopDelegatesSnapshot } from "@/lib/top-delegates";

import { useTopDelegatesNotVoted } from "./use-top-delegates-not-voted";

vi.mock("@gzeoneth/gov-tracker", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@gzeoneth/gov-tracker")>()),
  queryDelegatesNotVoted: vi.fn(),
  queryDelegateVotingPowers: vi.fn(),
}));
vi.mock("@/hooks/use-rpc-settings", () => ({
  useRpcSettings: () => ({ l2Rpc: "https://rpc.example", isHydrated: true }),
}));
vi.mock("@/lib/rpc-utils", () => ({
  createRpcProvider: vi.fn().mockResolvedValue({}),
}));
vi.mock("@/lib/delegate-cache", () => ({
  loadDelegateCache: vi.fn(),
  getDelegateDisplayRecords: vi.fn().mockResolvedValue(new Map()),
}));
vi.mock("@/lib/tally-data/client", () => ({
  getTallyDataClient: vi.fn(),
}));
vi.mock("@/lib/top-delegates", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/top-delegates")>()),
  fetchTopDelegatesSnapshot: vi.fn(),
}));

const GOVERNOR = "0x9999999999999999999999999999999999999999";
const DELEGATE_A = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const DELEGATE_B = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const DELEGATE_C = "0xcccccccccccccccccccccccccccccccccccccccc";
const ARB = (whole: number) => `${whole}000000000000000000`;

function row(address: string, votingPower: string): TallyDelegateListItem {
  return {
    address: address as `0x${string}`,
    votingPower,
    lastChangeBlock: 1,
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

function info(address: string, votingPower: string): DelegateInfo {
  return { address: address as `0x${string}`, votingPower, lastChangeBlock: 1 };
}

function syntheticDelegates(size: number): DelegateInfo[] {
  return Array.from({ length: size }, (_, i) =>
    info(`0x${(i + 1).toString(16).padStart(40, "0")}`, ARB(100_000 - i))
  );
}

function bundledCache(delegates: DelegateInfo[]): DelegateCache {
  return {
    version: 1,
    generatedAt: "2026-03-17T00:00:00.000Z",
    snapshotBlock: 1,
    startBlock: 0,
    chainId: 42161,
    totalVotingPower: "0",
    totalSupply: "0",
    delegates,
    stats: { totalDelegates: delegates.length },
  };
}

const getDelegatesPage = vi.fn();

function lastNotVotedOptions() {
  const calls = vi.mocked(queryDelegatesNotVoted).mock.calls;
  return calls[calls.length - 1][3] as {
    cache: DelegateCache;
    limit: number;
    maxDelegatesToCheck: number;
  };
}

async function renderUntilSettled() {
  const { result } = renderHook(() =>
    useTopDelegatesNotVoted({ proposalId: "1", governorAddress: GOVERNOR })
  );
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  return result;
}

describe("useTopDelegatesNotVoted data source", () => {
  beforeEach(() => {
    vi.mocked(getTallyDataClient).mockReturnValue({
      getDelegatesPage,
    } as unknown as ReturnType<typeof getTallyDataClient>);
    vi.mocked(queryDelegatesNotVoted).mockResolvedValue([
      { address: DELEGATE_A as `0x${string}`, votingPower: "1000", rank: 1 },
    ]);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("checks hasVoted against the indexer's top delegates without touching any fallback", async () => {
    getDelegatesPage.mockResolvedValue({
      delegates: [row(DELEGATE_A, "1000"), row(DELEGATE_B, "500")],
      totalVotingPower: "1500",
      totalSupply: "10000",
    });

    const result = await renderUntilSettled();

    expect(getDelegatesPage).toHaveBeenCalledWith(
      expect.objectContaining({
        limit: 100,
        offset: 0,
        sort: "votingPower",
        dir: "desc",
        minVotingPower: "5000000000000000000000",
        exclude: ["0x00000000000000000000000000000000000A4B86"],
      })
    );
    expect(fetchTopDelegatesSnapshot).not.toHaveBeenCalled();
    expect(loadDelegateCache).not.toHaveBeenCalled();
    expect(queryDelegateVotingPowers).not.toHaveBeenCalled();

    const options = lastNotVotedOptions();
    expect(options.limit).toBe(5);
    expect(options.maxDelegatesToCheck).toBe(100);
    expect(options.cache.delegates).toEqual([
      expect.objectContaining({ address: DELEGATE_A, votingPower: "1000" }),
      expect.objectContaining({ address: DELEGATE_B, votingPower: "500" }),
    ]);
    expect(result.current.delegatesNotVoted).toEqual([
      { address: DELEGATE_A, label: undefined, votingPower: "1000" },
    ]);
    expect(result.current.error).toBeNull();
  });

  it("trusts an empty indexer page instead of falling back", async () => {
    getDelegatesPage.mockResolvedValue({
      delegates: [],
      totalVotingPower: "0",
      totalSupply: "10000",
    });
    vi.mocked(queryDelegatesNotVoted).mockResolvedValue([]);

    const result = await renderUntilSettled();

    expect(fetchTopDelegatesSnapshot).not.toHaveBeenCalled();
    expect(loadDelegateCache).not.toHaveBeenCalled();
    expect(lastNotVotedOptions().cache.delegates).toEqual([]);
    expect(result.current.delegatesNotVoted).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  describe("when the indexer fetch fails", () => {
    beforeEach(() => {
      getDelegatesPage.mockRejectedValue(new Error("indexer down"));
    });

    it("re-ranks the server's candidate list on live on-chain power", async () => {
      vi.mocked(fetchTopDelegatesSnapshot).mockResolvedValue({
        delegates: [
          info(DELEGATE_A, ARB(10_000)),
          info(DELEGATE_B, ARB(9_000)),
          info(DELEGATE_C, ARB(8_000)),
        ],
        fetchedAt: "2026-10-30T12:00:00.000Z",
      });
      vi.mocked(queryDelegateVotingPowers).mockResolvedValue(
        new Map([
          [DELEGATE_A, ARB(4_000)], // fell below the 5,000 ARB threshold
          [DELEGATE_B, ARB(9_000)],
          [DELEGATE_C, ARB(30_000)], // climbed to the top
        ])
      );

      const result = await renderUntilSettled();

      expect(loadDelegateCache).not.toHaveBeenCalled();
      expect(queryDelegateVotingPowers).toHaveBeenCalledWith(
        expect.anything(),
        [DELEGATE_A, DELEGATE_B, DELEGATE_C]
      );
      const options = lastNotVotedOptions();
      expect(options.maxDelegatesToCheck).toBe(100);
      expect(
        options.cache.delegates.map((d) => [d.address, d.votingPower])
      ).toEqual([
        [DELEGATE_C, ARB(30_000)],
        [DELEGATE_B, ARB(9_000)],
      ]);
      expect(result.current.error).toBeNull();
    });

    it("refreshes powers in chunks of 100 and caps the ranked list at 100", async () => {
      const candidates = syntheticDelegates(300);
      vi.mocked(fetchTopDelegatesSnapshot).mockResolvedValue({
        delegates: candidates,
        fetchedAt: "2026-10-30T12:00:00.000Z",
      });
      vi.mocked(queryDelegateVotingPowers).mockImplementation(
        async (_provider, addresses) =>
          new Map(addresses.map((a) => [a.toLowerCase(), ARB(10_000)]))
      );

      await renderUntilSettled();

      const chunkSizes = vi
        .mocked(queryDelegateVotingPowers)
        .mock.calls.map(([, addresses]) => addresses.length);
      expect(chunkSizes).toEqual([100, 100, 100]);
      expect(lastNotVotedOptions().cache.delegates).toHaveLength(100);
    });

    it("falls back to the bundled snapshot's top 300 when the server list also fails", async () => {
      vi.mocked(fetchTopDelegatesSnapshot).mockRejectedValue(
        new Error("route down")
      );
      vi.mocked(loadDelegateCache).mockResolvedValue(
        bundledCache(syntheticDelegates(350))
      );
      vi.mocked(queryDelegateVotingPowers).mockImplementation(
        async (_provider, addresses) =>
          new Map(addresses.map((a) => [a.toLowerCase(), ARB(10_000)]))
      );

      const result = await renderUntilSettled();

      const refreshed = vi
        .mocked(queryDelegateVotingPowers)
        .mock.calls.reduce((n, [, addresses]) => n + addresses.length, 0);
      expect(refreshed).toBe(300);
      expect(lastNotVotedOptions().cache.delegates).toHaveLength(100);
      expect(result.current.error).toBeNull();
    });

    it("renders nothing when no candidate list is available", async () => {
      vi.mocked(fetchTopDelegatesSnapshot).mockRejectedValue(
        new Error("route down")
      );
      vi.mocked(loadDelegateCache).mockResolvedValue(null);

      const result = await renderUntilSettled();

      expect(queryDelegateVotingPowers).not.toHaveBeenCalled();
      expect(queryDelegatesNotVoted).not.toHaveBeenCalled();
      expect(result.current.delegatesNotVoted).toEqual([]);
      expect(result.current.error).toBeNull();
    });

    it("reports an error rather than showing stale powers when the RPC refresh fails", async () => {
      vi.mocked(fetchTopDelegatesSnapshot).mockResolvedValue({
        delegates: [info(DELEGATE_A, ARB(10_000))],
        fetchedAt: "2026-10-30T12:00:00.000Z",
      });
      vi.mocked(queryDelegateVotingPowers).mockRejectedValue(
        new Error("rpc down")
      );

      const result = await renderUntilSettled();

      expect(queryDelegatesNotVoted).not.toHaveBeenCalled();
      expect(result.current.error?.message).toBe("rpc down");
      expect(result.current.delegatesNotVoted).toEqual([]);
    });

    it("reports an error when no candidate got a live reading, instead of rendering listed powers", async () => {
      vi.mocked(fetchTopDelegatesSnapshot).mockResolvedValue({
        delegates: [
          info(DELEGATE_A, ARB(10_000)),
          info(DELEGATE_B, ARB(9_000)),
        ],
        fetchedAt: "2026-10-30T12:00:00.000Z",
      });
      vi.mocked(queryDelegateVotingPowers).mockResolvedValue(new Map());

      const result = await renderUntilSettled();

      expect(queryDelegatesNotVoted).not.toHaveBeenCalled();
      expect(result.current.error?.message).toMatch(
        /refresh returned no results for 2 candidates/
      );
      expect(result.current.delegatesNotVoted).toEqual([]);
      expect(result.current.allTopDelegatesVoted).toBe(false);
    });
  });

  it("surfaces a provider error even when the indexer page is healthy", async () => {
    getDelegatesPage.mockResolvedValue({
      delegates: [row(DELEGATE_A, "1000")],
      totalVotingPower: "1000",
      totalSupply: "10000",
    });
    vi.mocked(createRpcProvider).mockRejectedValueOnce(new Error("bad rpc"));

    const result = await renderUntilSettled();

    expect(getDelegatesPage).toHaveBeenCalledTimes(1);
    expect(queryDelegatesNotVoted).not.toHaveBeenCalled();
    expect(result.current.error?.message).toBe("bad rpc");
    expect(result.current.delegatesNotVoted).toEqual([]);
  });

  it("surfaces an error from the hasVoted query", async () => {
    getDelegatesPage.mockResolvedValue({
      delegates: [row(DELEGATE_A, "1000")],
      totalVotingPower: "1000",
      totalSupply: "10000",
    });
    vi.mocked(queryDelegatesNotVoted).mockRejectedValue(new Error("rpc down"));

    const result = await renderUntilSettled();

    expect(result.current.error?.message).toBe("rpc down");
    expect(result.current.delegatesNotVoted).toEqual([]);
  });
});
