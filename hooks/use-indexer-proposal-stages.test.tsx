// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { IndexerProposalStages } from "@/lib/tally-data/types";

import { useIndexerProposalStages } from "./use-indexer-proposal-stages";

const GOVERNOR = "0x00000000000000000000000000000000000E11e1";
const PROPOSAL_ID = "42";

const RESPONSE: IndexerProposalStages = {
  proposalId: PROPOSAL_ID,
  governorAddress: GOVERNOR.toLowerCase(),
  governorType: "L1_VOTING",
  executionPhase: null,
  executionCancelled: false,
  stages: [
    {
      type: "PROPOSAL_CREATED",
      status: "COMPLETED",
      chain: "ethereum",
      startedAt: 1,
      completedAt: 1,
      etaAt: null,
      txHash: `0x${"ab".repeat(32)}`,
      detail: null,
    },
    {
      type: "VOTING_ACTIVE",
      status: "PENDING",
      chain: "ethereum",
      startedAt: 2,
      completedAt: null,
      etaAt: null,
      txHash: null,
      detail: null,
    },
  ],
};

const fetchMock = vi.fn();

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("useIndexerProposalStages", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("reads the stages endpoint through the indexer proxy", async () => {
    fetchMock.mockResolvedValue(jsonResponse(RESPONSE));

    const { result } = renderHook(
      () =>
        useIndexerProposalStages({
          proposalId: PROPOSAL_ID,
          governorAddress: GOVERNOR,
        }),
      { wrapper }
    );

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/governance-indexer/api/tally/proposals/${GOVERNOR.toLowerCase()}/${PROPOSAL_ID}/stages`,
      expect.anything()
    );
    expect(result.current.data).toEqual(RESPONSE);
    expect(
      result.current.stages.map((stage) => [stage.type, stage.status])
    ).toEqual([
      ["PROPOSAL_CREATED", "COMPLETED"],
      ["VOTING_ACTIVE", "PENDING"],
    ]);
    expect(result.current.error).toBeNull();
  });

  it("reports a failed request as an error with no stages", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: "not found" }, 404));

    const { result } = renderHook(
      () =>
        useIndexerProposalStages({
          proposalId: PROPOSAL_ID,
          governorAddress: GOVERNOR,
        }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error).toMatch(/404/);
    expect(result.current.stages).toEqual([]);
  });

  it("makes no request when disabled", () => {
    const { result } = renderHook(
      () =>
        useIndexerProposalStages({
          proposalId: PROPOSAL_ID,
          governorAddress: GOVERNOR,
          enabled: false,
        }),
      { wrapper }
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toBeNull();
  });
});
