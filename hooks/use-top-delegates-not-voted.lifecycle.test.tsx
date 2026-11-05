// @vitest-environment jsdom
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import {
  queryDelegatesNotVoted,
  queryDelegateVotingPowers,
} from "@gzeoneth/gov-tracker";

import { GET as proxyIndexer } from "@/app/api/governance-indexer/[...path]/route";
import { GET as getTopDelegates } from "@/app/api/top-delegates/route";
import { loadDelegateCache } from "@/lib/delegate-cache";
import { resetTopDelegatesMemory } from "@/lib/top-delegates/server";

import { useTopDelegatesNotVoted } from "./use-top-delegates-not-voted";

vi.mock("server-only", () => ({}));
// Exercise the server's in-process retention independently of Next's data cache.
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock("@gzeoneth/gov-tracker", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@gzeoneth/gov-tracker")>()),
  queryDelegatesNotVoted: vi.fn(),
  queryDelegateVotingPowers: vi.fn(),
}));
vi.mock("@/hooks/use-rpc-settings", () => ({
  useRpcSettings: () => ({ l2Rpc: "https://rpc.example", isHydrated: true }),
}));
vi.mock("@/lib/rpc-utils", () => ({ createRpcProvider: async () => ({}) }));
vi.mock("@/lib/delegate-cache", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/delegate-cache")>()),
  loadDelegateCache: vi.fn().mockResolvedValue(null),
}));

const DELEGATE = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const GOVERNOR = "0x9999999999999999999999999999999999999999";
const LISTED_POWER = "10000000000000000000000";
const LIVE_POWER = "20000000000000000000000";
let indexerDown = false;

// Keep the client, both route handlers and indexerFetch real. Only the final
// upstream HTTP response and RPC SDK calls are controlled by this test.
const fetchMock = vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
  if (url === "/api/top-delegates") return getTopDelegates();
  if (url.startsWith("/api/governance-indexer/")) {
    const request = new Request(new URL(url, "http://app.example"));
    return proxyIndexer(request, {
      params: Promise.resolve({
        path: new URL(request.url).pathname.split("/").slice(3),
      }),
    });
  }
  if (url.startsWith("http://indexer.example/")) {
    if (indexerDown) return Response.json({ error: "outage" }, { status: 503 });
    if (new URL(url).pathname === "/api/tally/address-display-records") {
      return Response.json([]);
    }
    return Response.json({
      delegates: [
        { address: DELEGATE, votingPower: LISTED_POWER, lastChangeBlock: 1 },
      ],
      totalVotingPower: LISTED_POWER,
      totalSupply: LISTED_POWER,
    });
  }
  throw new Error(`Unexpected request: ${url}`);
});

beforeEach(() => {
  indexerDown = false;
  resetTopDelegatesMemory();
  vi.stubEnv("GOVERNANCE_INDEXER_URL", "http://indexer.example");
  vi.stubGlobal("fetch", fetchMock);
  vi.mocked(queryDelegateVotingPowers).mockResolvedValue(
    new Map([[DELEGATE, LIVE_POWER]])
  );
  vi.mocked(queryDelegatesNotVoted).mockImplementation(
    async (_provider, _proposalId, _governor, options) =>
      (options?.cache?.delegates ?? []).map((delegate, index) => ({
        address: delegate.address,
        votingPower: delegate.votingPower,
        rank: index + 1,
      }))
  );
});

afterEach(() => {
  cleanup();
  resetTopDelegatesMemory();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it("warms candidates during a healthy visit and renders them with live powers during a full indexer outage", async () => {
  const healthy = renderHook(() =>
    useTopDelegatesNotVoted({ proposalId: "1", governorAddress: GOVERNOR })
  );
  await waitFor(() => expect(healthy.result.current.isLoading).toBe(false));
  expect(healthy.result.current.error).toBeNull();

  const warmIndex = fetchMock.mock.calls.findIndex(
    ([input]) => input === "/api/top-delegates"
  );
  expect(warmIndex).toBeGreaterThanOrEqual(0);
  await fetchMock.mock.results[warmIndex].value;
  expect(
    fetchMock.mock.calls.some(
      ([input]) =>
        typeof input === "string" &&
        input.startsWith("http://indexer.example/api/tally/delegates?") &&
        new URL(input).searchParams.get("limit") === "300"
    )
  ).toBe(true);
  expect(queryDelegateVotingPowers).not.toHaveBeenCalled();
  healthy.unmount();

  indexerDown = true;
  const outage = renderHook(() =>
    useTopDelegatesNotVoted({ proposalId: "2", governorAddress: GOVERNOR })
  );
  await waitFor(() => expect(outage.result.current.isLoading).toBe(false));

  expect(outage.result.current.delegatesNotVoted).toEqual([
    { address: DELEGATE, votingPower: LIVE_POWER, label: undefined },
  ]);
  expect(outage.result.current.error).toBeNull();
  expect(loadDelegateCache).not.toHaveBeenCalled();
  expect(queryDelegateVotingPowers).toHaveBeenCalledWith(expect.anything(), [
    DELEGATE,
  ]);
});
