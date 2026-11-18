import type { MeResponse } from "@/lib/siwe/types";

/**
 * The address every owned read and write is scoped to.
 *
 * Indexers that still support act-as send `effectiveAddress` (`actingAs ??
 * address`). The hardened indexer removed act-as and sends only `address`, which
 * is then the subject. Reading both keeps sign-in working across the rollout.
 */
export function sessionSubject(
  session: Pick<MeResponse, "address" | "effectiveAddress"> | null
): string | null {
  if (!session) return null;
  return session.effectiveAddress ?? session.address ?? null;
}
