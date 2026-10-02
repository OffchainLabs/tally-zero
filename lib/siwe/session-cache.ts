import type { QueryClient } from "@tanstack/react-query";

import { siweApi } from "./client";
import { SAFES_SCOPE, siweKeys, SUBJECT_SCOPE } from "./keys";
import { meQueryOptions } from "./queries";

const pendingWalletLogouts = new WeakMap<QueryClient, Promise<void>>();

/**
 * Drop the cached session and re-read it from /api/me at once.
 *
 * The two steps are not interchangeable and neither is redundant, which is why
 * this lives in a function with a test rather than inline in a mutation:
 *
 *   - setQueryData alone is not enough. It moves `dataUpdatedAt`, so the cleared
 *     entry counts as *fresh* under the query's 30s staleTime and would survive
 *     until something else refetched it, typically a window focus.
 *   - invalidateQueries alone is not enough either. The old session stays
 *     readable for the length of the /api/me round trip, so the UI keeps
 *     rendering a session the user has already ended.
 *   - Reversing them loses the clear: the invalidation's refetch would resolve
 *     against a value the clear then overwrites.
 *
 * Callers must only reach for this once they know the session is actually gone.
 * See the signOut mutation in hooks/use-siwe.ts for why that matters.
 */
export function clearAndReconcileSession(
  queryClient: QueryClient
): Promise<void> {
  queryClient.setQueryData(siweKeys.me, null);
  queryClient.removeQueries({ queryKey: SUBJECT_SCOPE });
  queryClient.removeQueries({ queryKey: SAFES_SCOPE });
  return queryClient.invalidateQueries({ queryKey: siweKeys.me });
}

/** Revoke a live session if it belongs to a different connected wallet. */
export async function logoutPreviousWalletSession(
  queryClient: QueryClient,
  connectedAddress: string
): Promise<void> {
  // Every caller checks its own wallet after any earlier revocation finishes.
  await pendingWalletLogouts.get(queryClient);
  const session = await queryClient.fetchQuery({
    ...meQueryOptions,
    staleTime: 0,
  });
  if (
    !session ||
    session.address.toLowerCase() === connectedAddress.toLowerCase()
  ) {
    return;
  }
  return logoutWalletSessionSingleFlight(queryClient);
}

/** Share only the address-independent cookie revocation. */
function logoutWalletSessionSingleFlight(
  queryClient: QueryClient
): Promise<void> {
  const pending = pendingWalletLogouts.get(queryClient);
  if (pending) return pending;

  const logout = (async () => {
    await siweApi.logout();
    await clearAndReconcileSession(queryClient);
  })().finally(() => pendingWalletLogouts.delete(queryClient));
  pendingWalletLogouts.set(queryClient, logout);
  return logout;
}
