/**
 * Constants for Tenderly simulation
 */

export const ADDRESS_ALIAS_OFFSET = BigInt(
  "0x1111000000000000000000000000000000001111"
);

export const CHAIN_IDS = {
  arb1: "42161",
  nova: "42170",
  ethereum: "1",
} as const;

export const FUNCTION_SELECTORS = {
  schedule: "0x01d5062a",
  execute: "0x134008d3",
  scheduleBatch: "0x8f2a0bb0",
  executeBatch: "0xe38335e5",
} as const;
