import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import { siweApi } from "./client";
import { siweKeys } from "./keys";
import {
  clearAndReconcileSession,
  logoutPreviousWalletSession,
} from "./session-cache";

// No jsdom in this repo (vitest.config.ts sets environment "node"), so the hook
// itself is not rendered here. The behaviour worth pinning is not React's
// though, it is the cache's: the two calls inside clearAndReconcileSession are
// individually insufficient and order-dependent, and nothing about that is
// visible from reading them. These tests drive a real QueryClient, which needs
// no DOM.

const flush = () => new Promise((r) => setTimeout(r, 0));

const LIVE = { address: "0xsigner" };

/**
 * Mount an observer so the query is *active*. invalidateQueries only refetches
 * active queries, so without a subscriber these tests would pass for the wrong
 * reason.
 */
async function mountSession(queryFn: () => Promise<unknown>) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const observer = new QueryObserver(queryClient, {
    queryKey: [...siweKeys.me],
    queryFn,
    staleTime: 30_000,
  });
  const unsubscribe = observer.subscribe(() => {});
  await flush();
  await flush();
  return { queryClient, unsubscribe };
}

describe("clearAndReconcileSession", () => {
  it("clears the session and refetches it in one call", async () => {
    let calls = 0;
    let signedOut = false;
    const { queryClient, unsubscribe } = await mountSession(async () => {
      calls += 1;
      return signedOut ? null : LIVE;
    });
    expect(queryClient.getQueryData(siweKeys.me)).toEqual(LIVE);
    expect(calls).toBe(1);
    queryClient.setQueryData(siweKeys.drafts(LIVE.address), ["old draft"]);
    queryClient.setQueryData(siweKeys.safes(LIVE.address), ["old safe"]);

    // The server has dropped the session, so /api/me now answers 401, which
    // siweApi.me() maps to null.
    signedOut = true;
    await clearAndReconcileSession(queryClient);
    await flush();

    expect(queryClient.getQueryData(siweKeys.me)).toBeNull();
    expect(
      queryClient.getQueryData(siweKeys.drafts(LIVE.address))
    ).toBeUndefined();
    expect(
      queryClient.getQueryData(siweKeys.safes(LIVE.address))
    ).toBeUndefined();
    expect(calls).toBe(2);
    unsubscribe();
  });

  // The reason setQueryData is not sufficient on its own. If this ever fails
  // because setQueryData stops touching dataUpdatedAt, the invalidation in
  // clearAndReconcileSession has become redundant and the comment there is
  // wrong.
  it("clears a value that would otherwise stay fresh for the full staleTime", async () => {
    const { queryClient, unsubscribe } = await mountSession(async () => LIVE);

    queryClient.setQueryData(siweKeys.me, null);

    const query = queryClient.getQueryCache().find({ queryKey: siweKeys.me });
    expect(query?.isStale()).toBe(false);
    unsubscribe();
  });

  // The reason invalidateQueries is not sufficient on its own: until the refetch
  // resolves, the previous session is still what a reader sees.
  it("does not leave the old session readable while the refetch is in flight", async () => {
    // Gate the *second* fetch so the assertion below lands mid-flight. The
    // first fetch has to complete for there to be a session to clear.
    let gate: Promise<void> | undefined;
    let openGate = () => {};

    const { queryClient, unsubscribe } = await mountSession(async () => {
      if (gate) await gate;
      return LIVE;
    });
    expect(queryClient.getQueryData(siweKeys.me)).toEqual(LIVE);

    gate = new Promise<void>((resolve) => (openGate = resolve));
    const pending = clearAndReconcileSession(queryClient);

    // The clear has landed; the refetch has not answered yet.
    expect(queryClient.getQueryData(siweKeys.me)).toBeNull();

    openGate();
    await pending;
    unsubscribe();
  });
});

describe("wallet session logout", () => {
  it("checks each concurrent caller's wallet even when the first caller matches the cookie", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const first = "0x1111111111111111111111111111111111111111";
    const second = "0x2222222222222222222222222222222222222222";
    vi.spyOn(siweApi, "me").mockResolvedValue({ address: first } as Awaited<
      ReturnType<typeof siweApi.me>
    >);
    const logout = vi.spyOn(siweApi, "logout").mockResolvedValue();
    try {
      await Promise.all([
        logoutPreviousWalletSession(client, first),
        logoutPreviousWalletSession(client, second),
      ]);
      expect(logout).toHaveBeenCalledOnce();
      expect(client.getQueryData(siweKeys.me)).toBeNull();
    } finally {
      client.clear();
      vi.restoreAllMocks();
    }
  });
});
