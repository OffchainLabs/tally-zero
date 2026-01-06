/**
 * Address alias utilities for L1->L2 message passing
 */

import { L1_TIMELOCK } from "@config/arbitrum-governance";

import { ADDRESS_ALIAS_OFFSET } from "./constants";

/**
 * Calculate the aliased address for L1->L2 messaging
 * When an L1 contract sends a message to L2, its address is aliased
 */
export function calculateAddressAlias(l1Address: string): string {
  const address = BigInt(l1Address);
  const alias = (address + ADDRESS_ALIAS_OFFSET) % BigInt(2 ** 160);
  return "0x" + alias.toString(16).padStart(40, "0");
}

/**
 * Get the aliased address for the L1 Timelock
 */
export function getL1TimelockAlias(): string {
  return calculateAddressAlias(L1_TIMELOCK.address);
}
