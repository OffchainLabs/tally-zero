/**
 * Server-side utility for reading full delegate profile data from
 * data/delegates-*.json. These files must NOT be imported in client
 * components. Use data/delegate-index.json for client needs.
 */

import type { TallyDelegate } from "@/types/tally-delegate";

let delegateMap: Map<string, TallyDelegate> | null = null;

function loadDelegateMap(): Map<string, TallyDelegate> {
  if (delegateMap) return delegateMap;

  const raw: TallyDelegate[] = [
    ...require("@/data/delegates-1.json"),
    ...require("@/data/delegates-2.json"),
    ...require("@/data/delegates-3.json"),
  ];
  delegateMap = new Map();
  for (const d of raw) {
    delegateMap.set(d.account.address.toLowerCase(), d);
  }
  return delegateMap;
}

/**
 * Look up full Tally delegate profile by address. Server-side only.
 */
export function getTallyDelegate(address: string): TallyDelegate | null {
  const map = loadDelegateMap();
  return map.get(address.toLowerCase()) ?? null;
}

/**
 * Return all delegate addresses from delegates.json. Server-side only.
 * Used by generateStaticParams.
 */
export function getAllTallyAddresses(): string[] {
  const map = loadDelegateMap();
  return Array.from(map.keys());
}
