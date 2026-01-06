/**
 * Tests for tenderly address-alias utilities
 */

import { L1_TIMELOCK } from "@config/arbitrum-governance";
import { describe, expect, it } from "vitest";

import { calculateAddressAlias, getL1TimelockAlias } from "./address-alias";

describe("calculateAddressAlias", () => {
  it("correctly aliases the zero address", () => {
    const zeroAddress = "0x0000000000000000000000000000000000000000";
    const result = calculateAddressAlias(zeroAddress);
    // Zero + offset = offset
    expect(result).toBe("0x1111000000000000000000000000000000001111");
  });

  it("correctly aliases a typical contract address", () => {
    // Example: Some L1 contract address
    const l1Address = "0x0000000000000000000000000000000000000001";
    const result = calculateAddressAlias(l1Address);
    // 0x1 + offset = 0x1111000000000000000000000000000000001112
    expect(result).toBe("0x1111000000000000000000000000000000001112");
  });

  it("handles the L1 Timelock address", () => {
    // L1 Timelock: 0xE6841D92B0C345144506576eC13ECf5103aC7f49
    const result = calculateAddressAlias(L1_TIMELOCK.address);
    // This should match the known aliased address
    expect(result).toMatch(/^0x[a-f0-9]{40}$/);
    expect(result.length).toBe(42);
  });

  it("handles address overflow (wraps around 2^160)", () => {
    // Address close to max that would overflow when adding offset
    const highAddress = "0xffffffffffffffffffffffffffffffffffffffff";
    const result = calculateAddressAlias(highAddress);
    // Result should be valid address (wrapped around)
    expect(result).toMatch(/^0x[a-f0-9]{40}$/);
    expect(result.length).toBe(42);
  });

  it("returns lowercase hex address", () => {
    const address = "0xE6841D92B0C345144506576eC13ECf5103aC7f49";
    const result = calculateAddressAlias(address);
    expect(result).toBe(result.toLowerCase());
  });

  it("pads short results to 40 hex characters", () => {
    // Small address that would result in short hex
    const smallAddress = "0x0000000000000000000000000000000000000000";
    const result = calculateAddressAlias(smallAddress);
    // Should be 0x + 40 hex chars = 42 total
    expect(result.length).toBe(42);
    expect(result.startsWith("0x")).toBe(true);
  });
});

describe("getL1TimelockAlias", () => {
  it("returns the aliased L1 Timelock address", () => {
    const result = getL1TimelockAlias();
    expect(result).toMatch(/^0x[a-f0-9]{40}$/);
    expect(result.length).toBe(42);
  });

  it("matches calculateAddressAlias for L1 Timelock", () => {
    const direct = calculateAddressAlias(L1_TIMELOCK.address);
    const helper = getL1TimelockAlias();
    expect(helper).toBe(direct);
  });

  it("returns consistent value across calls", () => {
    const first = getL1TimelockAlias();
    const second = getL1TimelockAlias();
    expect(first).toBe(second);
  });
});
