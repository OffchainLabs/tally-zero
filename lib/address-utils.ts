/**
 * Address utilities for Ethereum address handling
 * Provides case-insensitive address comparison and validation
 */

/**
 * Compare two Ethereum addresses in a case-insensitive manner
 * Ethereum addresses are case-insensitive, but EIP-55 checksum encoding uses mixed case
 */
export function addressesEqual(
  addr1: string | undefined | null,
  addr2: string | undefined | null
): boolean {
  if (!addr1 || !addr2) return false;
  return addr1.toLowerCase() === addr2.toLowerCase();
}

/**
 * Find an item in an array by comparing its address property (case-insensitive)
 */
export function findByAddress<T extends { address: string }>(
  items: readonly T[],
  address: string | undefined | null
): T | undefined {
  if (!address) return undefined;
  const normalized = address.toLowerCase();
  return items.find((item) => item.address.toLowerCase() === normalized);
}

/** Regex pattern for validating Ethereum addresses (40 hex chars) */
export const ETH_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

/** Regex pattern for validating transaction/operation hashes (64 hex chars) */
export const TX_HASH_REGEX = /^0x[a-fA-F0-9]{64}$/;

/**
 * Validate an Ethereum address format
 */
export function isValidAddress(value: string | undefined | null): boolean {
  if (!value) return false;
  return ETH_ADDRESS_REGEX.test(value);
}

/**
 * Validate a transaction or operation hash format
 */
export function isValidTxHash(value: string | undefined | null): boolean {
  if (!value) return false;
  return TX_HASH_REGEX.test(value);
}
