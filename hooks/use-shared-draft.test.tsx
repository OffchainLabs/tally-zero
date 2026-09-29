// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { siweApi, SiweApiError } from "@/lib/siwe/client";

import { useSharedDraft } from "./use-drafts";

vi.mock("./use-siwe", () => ({ useSiwe: vi.fn() }));

describe("useSharedDraft retries", () => {
  let client: QueryClient;

  afterEach(() => {
    cleanup();
    client?.clear();
    vi.restoreAllMocks();
  });

  it.each([
    { error: new SiweApiError(404, "not_found", "Draft not found."), calls: 1 },
    { error: new SiweApiError(502, "error", "Bad gateway."), calls: 4 },
    { error: new SiweApiError(503, "error", "Service unavailable."), calls: 4 },
    { error: new TypeError("Failed to fetch"), calls: 4 },
  ])("makes $calls requests for $error.message", async ({ error, calls }) => {
    const getDraft = vi
      .spyOn(siweApi, "getSharedDraft")
      .mockRejectedValue(error);
    client = new QueryClient({
      defaultOptions: { queries: { retryDelay: 0, gcTime: Infinity } },
    });
    const { result } = renderHook(() => useSharedDraft("missing-slug"), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error).toBe(error);
    expect(getDraft).toHaveBeenCalledTimes(calls);
    expect(getDraft).toHaveBeenCalledWith("missing-slug");
  });
});
