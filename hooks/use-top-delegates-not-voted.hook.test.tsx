// @vitest-environment jsdom
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  queryDelegatesNotVoted,
  type DelegateCache,
} from "@gzeoneth/gov-tracker";

import { loadDelegateCache } from "@/lib/delegate-cache";
import { getTallyDataClient } from "@/lib/tally-data/client";
import type { TallyDelegateListItem } from "@/lib/tally-data/types";

import { useTopDelegatesNotVoted } from "./use-top-delegates-not-voted";

vi.mock("@gzeoneth/gov-tracker", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@gzeoneth/gov-tracker")>()),
  queryDelegatesNotVoted: vi.fn(),
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

const GOVERNOR = "0x9999999999999999999999999999999999999999";
const DELEGATE_A = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const DELEGATE_B = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

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

function bundledCache(size: number): DelegateCache {
  return {
    version: 1,
    generatedAt: "2026-03-17T00:00:00.000Z",
    snapshotBlock: 1,
    startBlock: 0,
    chainId: 42161,
    totalVotingPower: "0",
    totalSupply: "0",
    delegates: Array.from({ length: size }, (_, i) => ({
      address: `0x${(i + 1).toString(16).padStart(40, "0")}` as `0x${string}`,
      votingPower: String(size - i),
      lastChangeBlock: 1,
    })),
    stats: { totalDelegates: size },
  };
}

const getDelegatesPage = vi.fn();

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

  it("checks hasVoted against the indexer's top delegates, not the bundled cache", async () => {
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
    expect(loadDelegateCache).not.toHaveBeenCalled();
    expect(queryDelegatesNotVoted).toHaveBeenCalledWith(
      expect.anything(),
      "1",
      GOVERNOR,
      expect.objectContaining({
        limit: 5,
        maxDelegatesToCheck: 100,
        cache: expect.objectContaining({
          delegates: [
            expect.objectContaining({
              address: DELEGATE_A,
              votingPower: "1000",
            }),
            expect.objectContaining({
              address: DELEGATE_B,
              votingPower: "500",
            }),
          ],
        }),
      })
    );
    expect(result.current.delegatesNotVoted).toEqual([
      { address: DELEGATE_A, label: undefined, votingPower: "1000" },
    ]);
    expect(result.current.error).toBeNull();
  });

  it("falls back to the bundled cache when the indexer fails, still capped at 100", async () => {
    getDelegatesPage.mockRejectedValue(new Error("indexer down"));
    const bundled = bundledCache(150);
    vi.mocked(loadDelegateCache).mockResolvedValue(bundled);

    const result = await renderUntilSettled();

    expect(loadDelegateCache).toHaveBeenCalledTimes(1);
    expect(queryDelegatesNotVoted).toHaveBeenCalledWith(
      expect.anything(),
      "1",
      GOVERNOR,
      expect.objectContaining({ cache: bundled, maxDelegatesToCheck: 100 })
    );
    expect(result.current.error).toBeNull();
  });

  it("trusts an empty indexer page instead of loading the bundled cache", async () => {
    getDelegatesPage.mockResolvedValue({
      delegates: [],
      totalVotingPower: "0",
      totalSupply: "10000",
    });
    vi.mocked(queryDelegatesNotVoted).mockResolvedValue([]);

    const result = await renderUntilSettled();

    expect(loadDelegateCache).not.toHaveBeenCalled();
    expect(queryDelegatesNotVoted).toHaveBeenCalledWith(
      expect.anything(),
      "1",
      GOVERNOR,
      expect.objectContaining({
        cache: expect.objectContaining({ delegates: [] }),
      })
    );
    expect(result.current.delegatesNotVoted).toEqual([]);
    expect(result.current.error).toBeNull();
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
