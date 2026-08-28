import type { QueryClient } from "@tanstack/react-query";

import { siweKeys } from "./keys";

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
  return queryClient.invalidateQueries({ queryKey: siweKeys.me });
}
