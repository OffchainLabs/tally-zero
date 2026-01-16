import { describe, expect, it } from "vitest";

import {
  addressesEqual,
  ETH_ADDRESS_REGEX,
  findByAddress,
  isValidAddress,
  isValidTxHash,
  TX_HASH_REGEX,
} from "./address-utils";

describe("address-utils", () => {
  // Sample addresses in different case formats
  const checksumAddress = "0x912CE59144191C1204E64559FE8253a0e49E6548";
  const lowercaseAddress = "0x912ce59144191c1204e64559fe8253a0e49e6548";
  const mixedCaseAddress = "0x912CE59144191c1204E64559FE8253A0E49E6548";

  describe("addressesEqual", () => {
    it("returns true for identical addresses", () => {
      expect(addressesEqual(checksumAddress, checksumAddress)).toBe(true);
    });

    it("returns true for same address with different cases", () => {
      expect(addressesEqual(checksumAddress, lowercaseAddress)).toBe(true);
      expect(addressesEqual(checksumAddress, mixedCaseAddress)).toBe(true);
      expect(addressesEqual(lowercaseAddress, mixedCaseAddress)).toBe(true);
    });

    it("returns false for different addresses", () => {
      const otherAddress = "0x1234567890123456789012345678901234567890";
      expect(addressesEqual(checksumAddress, otherAddress)).toBe(false);
    });

    it("returns false when first address is null", () => {
      expect(addressesEqual(null, checksumAddress)).toBe(false);
    });

    it("returns false when second address is null", () => {
      expect(addressesEqual(checksumAddress, null)).toBe(false);
    });

    it("returns false when first address is undefined", () => {
      expect(addressesEqual(undefined, checksumAddress)).toBe(false);
    });

    it("returns false when second address is undefined", () => {
      expect(addressesEqual(checksumAddress, undefined)).toBe(false);
    });

    it("returns false when both addresses are null", () => {
      expect(addressesEqual(null, null)).toBe(false);
    });

    it("returns false when both addresses are undefined", () => {
      expect(addressesEqual(undefined, undefined)).toBe(false);
    });

    it("returns false for empty strings", () => {
      expect(addressesEqual("", checksumAddress)).toBe(false);
      expect(addressesEqual(checksumAddress, "")).toBe(false);
    });
  });

  describe("findByAddress", () => {
    interface TestItem {
      address: string;
      name: string;
    }

    const items: TestItem[] = [
      {
        address: "0x912CE59144191C1204E64559FE8253a0e49E6548",
        name: "Token A",
      },
      {
        address: "0x1234567890123456789012345678901234567890",
        name: "Token B",
      },
      {
        address: "0xABCDEF1234567890123456789012345678901234",
        name: "Token C",
      },
    ];

    it("finds item by exact address match", () => {
      const result = findByAddress(items, checksumAddress);
      expect(result).toBeDefined();
      expect(result?.name).toBe("Token A");
    });

    it("finds item by lowercase address", () => {
      const result = findByAddress(items, lowercaseAddress);
      expect(result).toBeDefined();
      expect(result?.name).toBe("Token A");
    });

    it("finds item by mixed case address", () => {
      const result = findByAddress(items, mixedCaseAddress);
      expect(result).toBeDefined();
      expect(result?.name).toBe("Token A");
    });

    it("returns undefined when address not found", () => {
      const notFound = "0x0000000000000000000000000000000000000001";
      expect(findByAddress(items, notFound)).toBeUndefined();
    });

    it("returns undefined for null address", () => {
      expect(findByAddress(items, null)).toBeUndefined();
    });

    it("returns undefined for undefined address", () => {
      expect(findByAddress(items, undefined)).toBeUndefined();
    });

    it("returns undefined for empty string", () => {
      expect(findByAddress(items, "")).toBeUndefined();
    });

    it("returns undefined for empty items array", () => {
      expect(findByAddress([], checksumAddress)).toBeUndefined();
    });
  });

  describe("ETH_ADDRESS_REGEX", () => {
    it("matches valid addresses", () => {
      expect(
        ETH_ADDRESS_REGEX.test("0x912CE59144191C1204E64559FE8253a0e49E6548")
      ).toBe(true);
      expect(
        ETH_ADDRESS_REGEX.test("0x0000000000000000000000000000000000000000")
      ).toBe(true);
    });

    it("rejects invalid addresses", () => {
      expect(
        ETH_ADDRESS_REGEX.test("912CE59144191C1204E64559FE8253a0e49E6548")
      ).toBe(false);
      expect(
        ETH_ADDRESS_REGEX.test("0x912CE59144191C1204E64559FE8253a0e49E654")
      ).toBe(false);
      expect(
        ETH_ADDRESS_REGEX.test("0x912CE59144191C1204E64559FE8253a0e49E65489")
      ).toBe(false);
      expect(ETH_ADDRESS_REGEX.test("")).toBe(false);
    });
  });

  describe("TX_HASH_REGEX", () => {
    const validHash = "0x" + "a".repeat(64);

    it("matches valid tx hashes", () => {
      expect(TX_HASH_REGEX.test(validHash)).toBe(true);
      expect(TX_HASH_REGEX.test("0x" + "0".repeat(64))).toBe(true);
    });

    it("rejects invalid tx hashes", () => {
      expect(TX_HASH_REGEX.test("a".repeat(64))).toBe(false);
      expect(TX_HASH_REGEX.test("0x" + "a".repeat(63))).toBe(false);
      expect(TX_HASH_REGEX.test("0x" + "a".repeat(65))).toBe(false);
      expect(TX_HASH_REGEX.test("")).toBe(false);
    });
  });

  describe("isValidAddress", () => {
    it("returns true for valid addresses", () => {
      expect(isValidAddress("0x912CE59144191C1204E64559FE8253a0e49E6548")).toBe(
        true
      );
    });

    it("returns false for invalid addresses", () => {
      expect(isValidAddress("invalid")).toBe(false);
      expect(isValidAddress("0x912CE59")).toBe(false);
    });

    it("returns false for null/undefined", () => {
      expect(isValidAddress(null)).toBe(false);
      expect(isValidAddress(undefined)).toBe(false);
      expect(isValidAddress("")).toBe(false);
    });
  });

  describe("isValidTxHash", () => {
    const validHash = "0x" + "a".repeat(64);

    it("returns true for valid tx hashes", () => {
      expect(isValidTxHash(validHash)).toBe(true);
    });

    it("returns false for invalid tx hashes", () => {
      expect(isValidTxHash("invalid")).toBe(false);
      expect(isValidTxHash("0x" + "a".repeat(40))).toBe(false);
    });

    it("returns false for null/undefined", () => {
      expect(isValidTxHash(null)).toBe(false);
      expect(isValidTxHash(undefined)).toBe(false);
      expect(isValidTxHash("")).toBe(false);
    });
  });
});
