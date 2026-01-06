/**
 * Address utilities for calldata decoding
 * Provides chain labels and known address lookup for governance contracts
 */

import knownAddresses from "@data/known-addresses.json";

import type { ChainContext } from "./types";

/**
 * Get chain label for display
 * @param chain - The chain context
 * @returns Human-readable chain label
 */
export function getChainLabel(chain: ChainContext): string {
  switch (chain) {
    case "arb1":
      return "Arb1";
    case "nova":
      return "Nova";
    case "ethereum":
      return "L1";
  }
}

/**
 * Look up known address label from the registry
 * @param address - The address to look up
 * @param chain - The chain context for the address
 * @returns The label if found, undefined otherwise
 */
export function getAddressLabel(
  address: string,
  chain: ChainContext
): string | undefined {
  const chainAddresses = knownAddresses.addresses[chain] as
    | Record<string, string>
    | undefined;
  if (!chainAddresses) return undefined;

  // Try exact match first
  if (chainAddresses[address]) {
    return chainAddresses[address];
  }

  // Try case-insensitive match
  const lowerAddress = address.toLowerCase();
  for (const [addr, label] of Object.entries(chainAddresses)) {
    if (addr.toLowerCase() === lowerAddress) {
      return label;
    }
  }

  return undefined;
}
