import { describe, expect, it } from "vitest";

import { calculateAddressAlias, getL1TimelockAlias } from "./tenderly";

describe("tenderly", () => {
  describe("calculateAddressAlias", () => {
    it("adds the alias offset to an address", () => {
      // The alias offset is 0x1111000000000000000000000000000000001111
      // For address 0x0000000000000000000000000000000000000001:
      // Result = 0x1111000000000000000000000000000000001111 + 0x1 = 0x1111000000000000000000000000000000001112
      const result = calculateAddressAlias(
        "0x0000000000000000000000000000000000000001"
      );
      expect(result.toLowerCase()).toBe(
        "0x1111000000000000000000000000000000001112"
      );
    });

    it("handles zero address", () => {
      const result = calculateAddressAlias(
        "0x0000000000000000000000000000000000000000"
      );
      // Just the offset itself
      expect(result.toLowerCase()).toBe(
        "0x1111000000000000000000000000000000001111"
      );
    });

    it("handles maximum address before overflow", () => {
      // When address + offset > 2^160, it should wrap around
      // This tests the modulo operation
      const maxAddress = "0xffffffffffffffffffffffffffffffffffffffff";
      const result = calculateAddressAlias(maxAddress);
      // Should wrap around due to modulo
      expect(result).toMatch(/^0x[0-9a-f]{40}$/i);
    });

    it("produces valid ethereum address format", () => {
      const result = calculateAddressAlias(
        "0x1234567890abcdef1234567890abcdef12345678"
      );
      // Should be 42 chars (0x + 40 hex chars)
      expect(result).toHaveLength(42);
      expect(result).toMatch(/^0x[0-9a-f]{40}$/);
    });

    it("handles addresses with different case", () => {
      const lower = calculateAddressAlias(
        "0xabcdef1234567890abcdef1234567890abcdef12"
      );
      const upper = calculateAddressAlias(
        "0xABCDEF1234567890ABCDEF1234567890ABCDEF12"
      );
      // BigInt should handle both cases the same
      expect(lower.toLowerCase()).toBe(upper.toLowerCase());
    });
  });

  describe("getL1TimelockAlias", () => {
    it("returns a valid ethereum address", () => {
      const alias = getL1TimelockAlias();
      expect(alias).toMatch(/^0x[0-9a-f]{40}$/);
    });

    it("returns consistent result", () => {
      // Should always return the same alias for the L1 timelock
      const alias1 = getL1TimelockAlias();
      const alias2 = getL1TimelockAlias();
      expect(alias1).toBe(alias2);
    });
  });
});
