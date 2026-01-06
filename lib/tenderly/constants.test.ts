/**
 * Tests for tenderly constants
 */

import { describe, expect, it } from "vitest";

import {
  ADDRESS_ALIAS_OFFSET,
  CHAIN_IDS,
  FUNCTION_SELECTORS,
} from "./constants";

describe("ADDRESS_ALIAS_OFFSET", () => {
  it("is the correct Arbitrum L1->L2 alias offset", () => {
    // This is the official Arbitrum address alias offset
    const expected = BigInt("0x1111000000000000000000000000000000001111");
    expect(ADDRESS_ALIAS_OFFSET).toBe(expected);
  });

  it("is a BigInt", () => {
    expect(typeof ADDRESS_ALIAS_OFFSET).toBe("bigint");
  });
});

describe("CHAIN_IDS", () => {
  it("has correct Arbitrum One chain ID", () => {
    expect(CHAIN_IDS.arb1).toBe("42161");
  });

  it("has correct Arbitrum Nova chain ID", () => {
    expect(CHAIN_IDS.nova).toBe("42170");
  });

  it("has correct Ethereum chain ID", () => {
    expect(CHAIN_IDS.ethereum).toBe("1");
  });

  it("has all expected chains", () => {
    expect(Object.keys(CHAIN_IDS)).toEqual(["arb1", "nova", "ethereum"]);
  });
});

describe("FUNCTION_SELECTORS", () => {
  it("has correct schedule selector", () => {
    // schedule(address,uint256,bytes,bytes32,bytes32,uint256)
    expect(FUNCTION_SELECTORS.schedule).toBe("0x01d5062a");
  });

  it("has correct execute selector", () => {
    // execute(address,uint256,bytes,bytes32,bytes32)
    expect(FUNCTION_SELECTORS.execute).toBe("0x134008d3");
  });

  it("has correct scheduleBatch selector", () => {
    // scheduleBatch(address[],uint256[],bytes[],bytes32,bytes32,uint256)
    expect(FUNCTION_SELECTORS.scheduleBatch).toBe("0x8f2a0bb0");
  });

  it("has correct executeBatch selector", () => {
    // executeBatch(address[],uint256[],bytes[],bytes32,bytes32)
    expect(FUNCTION_SELECTORS.executeBatch).toBe("0xe38335e5");
  });

  it("all selectors are 4-byte hex strings", () => {
    for (const selector of Object.values(FUNCTION_SELECTORS)) {
      expect(selector).toMatch(/^0x[a-f0-9]{8}$/);
    }
  });
});
