import shuffle from "lodash.shuffle";

/**
 * Collection utilities
 * Common functions for working with arrays and maps
 */

/**
 * Build a lookup Map from an array for O(1) access by key
 *
 * @param items - Array of items to index
 * @param getKey - Function to extract the key from each item
 * @returns Map from key to item
 *
 * @example
 * const users = [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }];
 * const usersById = buildLookupMap(users, u => u.id);
 * usersById.get(1); // { id: 1, name: 'Alice' }
 */
export function buildLookupMap<T, K>(
  items: readonly T[],
  getKey: (item: T) => K
): Map<K, T> {
  return new Map(items.map((item) => [getKey(item), item]));
}

/**
 * Build a randomized key-to-index map for stable random ordering.
 *
 * @param keys - Keys to assign randomized indices to
 * @returns Map from key to randomized index
 *
 * @example
 * const randomOrder = buildShuffleMap(["0x1", "0x2", "0x3"]);
 * randomOrder.get("0x2"); // randomized index
 */
export function buildShuffleMap(keys: readonly string[]): Map<string, number> {
  const map = new Map<string, number>();
  shuffle([...keys]).forEach((key, index) => map.set(key, index));
  return map;
}

/**
 * Sort items using a precomputed key-to-index map.
 * Items missing from the map are placed at the end.
 *
 * @param items - Items to sort
 * @param getKey - Function to extract the lookup key from each item
 * @param orderMap - Precomputed ordering map
 * @returns New array sorted by the order map
 *
 * @example
 * const sorted = sortByOrderMap(delegates, d => d.address, randomOrder);
 */
export function sortByOrderMap<T>(
  items: readonly T[],
  getKey: (item: T) => string,
  orderMap: ReadonlyMap<string, number>
): T[] {
  return [...items].sort((a, b) => {
    const aIndex = orderMap.get(getKey(a)) ?? Number.MAX_SAFE_INTEGER;
    const bIndex = orderMap.get(getKey(b)) ?? Number.MAX_SAFE_INTEGER;
    return aIndex - bIndex;
  });
}

/**
 * Compare two BigInt values represented as strings
 * Useful for sorting arrays by BigInt fields
 *
 * @param a - First BigInt string
 * @param b - Second BigInt string
 * @returns Negative if a < b, positive if a > b, zero if equal
 *
 * @example
 * delegates.sort((a, b) => compareBigInt(b.votingPower, a.votingPower));
 */
export function compareBigInt(a: string, b: string): number {
  const diff = BigInt(a) - BigInt(b);
  if (diff > BigInt(0)) return 1;
  if (diff < BigInt(0)) return -1;
  return 0;
}

/**
 * Compare two BigInt values in descending order
 * Convenience wrapper for sorting from highest to lowest
 *
 * @param a - First BigInt string
 * @param b - Second BigInt string
 * @returns Comparison result for descending sort
 *
 * @example
 * delegates.sort((a, b) => compareBigIntDesc(a.votingPower, b.votingPower));
 */
export function compareBigIntDesc(a: string, b: string): number {
  return compareBigInt(b, a);
}

/**
 * Sum an array of BigInt values represented as strings
 *
 * @param items - Array of items to sum
 * @param getValue - Function to extract the BigInt string from each item
 * @returns Sum as a string
 *
 * @example
 * const total = sumBigInt(delegates, d => d.votingPower);
 */
export function sumBigInt<T>(
  items: readonly T[],
  getValue: (item: T) => string
): string {
  return items
    .reduce((sum, item) => sum + BigInt(getValue(item)), BigInt(0))
    .toString();
}
