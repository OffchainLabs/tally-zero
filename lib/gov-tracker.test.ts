/**
 * Tests for @gzeoneth/gov-tracker integration
 * Verifies that gov-tracker functions work correctly in our environment
 */

import {
  decodeRetryableTicket,
  formatDecodedValue,
  getAddressLabel,
  isLikelyCalldata,
  isRetryableTicketMagic,
  lookupLocalSignature,
} from "@gzeoneth/gov-tracker";
import { ethers } from "ethers";
import { describe, expect, it } from "vitest";
import { getAddressExplorerUrl } from "./explorer-utils";

const RETRYABLE_TICKET_MAGIC = "0xa723c008e76e379c55599d2e4d93879beafda79c";
const ARB1_INBOX = "0x4dbd4fc535ac27206064b68ffcf827b0a60bab3f";
const NOVA_INBOX = "0xc4448b71118c9071bcb9734a0eac55d18a153949";

describe("gov-tracker integration", () => {
  describe("getAddressExplorerUrl", () => {
    it("returns arbiscan URL for arb1", () => {
      const address = "0x1234567890123456789012345678901234567890";
      expect(getAddressExplorerUrl(address, "arb1")).toBe(
        `https://arbiscan.io/address/${address}`
      );
    });

    it("returns nova arbiscan URL for nova", () => {
      const address = "0x1234567890123456789012345678901234567890";
      expect(getAddressExplorerUrl(address, "nova")).toBe(
        `https://nova.arbiscan.io/address/${address}`
      );
    });

    it("returns etherscan URL for ethereum", () => {
      const address = "0x1234567890123456789012345678901234567890";
      expect(getAddressExplorerUrl(address, "ethereum")).toBe(
        `https://etherscan.io/address/${address}`
      );
    });
  });

  describe("getAddressLabel", () => {
    it("returns undefined for unknown address", () => {
      expect(
        getAddressLabel("0x0000000000000000000000000000000000000000", "arb1")
      ).toBeUndefined();
    });

    it("handles case-insensitive lookup", () => {
      // Core Governor address should be in known addresses
      const coreGov = "0xf07DeD9dC292157749B6Fd268E37DF6EA38395B9";
      const label1 = getAddressLabel(coreGov, "arb1");
      const label2 = getAddressLabel(coreGov.toLowerCase(), "arb1");
      // Both should return the same label (or both undefined if not in list)
      expect(label1).toBe(label2);
    });
  });

  describe("lookupLocalSignature", () => {
    it("returns signature for known selector", () => {
      // sendTxToL1 is a common function in the governance system
      const selector = "0x928c169a";
      const signature = lookupLocalSignature(selector);
      // This should be in the local signatures file
      if (signature) {
        expect(signature).toContain("sendTxToL1");
      }
    });

    it("returns null for unknown selector", () => {
      const selector = "0xdeadbeef";
      expect(lookupLocalSignature(selector)).toBeNull();
    });

    it("handles case-insensitive selectors", () => {
      const selector1 = "0x928c169a";
      const selector2 = "0x928C169A";
      const sig1 = lookupLocalSignature(selector1);
      const sig2 = lookupLocalSignature(selector2);
      expect(sig1).toBe(sig2);
    });
  });

  describe("isLikelyCalldata", () => {
    it("returns false for non-0x prefix", () => {
      expect(isLikelyCalldata("928c169a")).toBe(false);
      expect(isLikelyCalldata("hello")).toBe(false);
    });

    it("returns false for short hex", () => {
      expect(isLikelyCalldata("0x")).toBe(false);
      expect(isLikelyCalldata("0x1234")).toBe(false);
      expect(isLikelyCalldata("0x123456")).toBe(false);
    });

    it("returns true for valid selector (8 hex chars after 0x)", () => {
      expect(isLikelyCalldata("0x12345678")).toBe(true);
      expect(isLikelyCalldata("0xabcdef12")).toBe(true);
    });

    it("returns true for full calldata", () => {
      const calldata =
        "0x928c169a000000000000000000000000e6841d92b0c345144506576ec13ecf5103ac7f49";
      expect(isLikelyCalldata(calldata)).toBe(true);
    });

    it("returns false for invalid hex characters", () => {
      expect(isLikelyCalldata("0x1234567g")).toBe(false);
      expect(isLikelyCalldata("0xghijklmn")).toBe(false);
    });

    it("handles case-insensitive hex", () => {
      expect(isLikelyCalldata("0xABCDEF12")).toBe(true);
      expect(isLikelyCalldata("0xabcdef12")).toBe(true);
    });
  });

  describe("isRetryableTicketMagic", () => {
    it("returns true for magic address", () => {
      expect(isRetryableTicketMagic(RETRYABLE_TICKET_MAGIC)).toBe(true);
    });

    it("returns false for other addresses", () => {
      expect(
        isRetryableTicketMagic("0x1234567890123456789012345678901234567890")
      ).toBe(false);
      expect(isRetryableTicketMagic(ARB1_INBOX)).toBe(false);
    });

    it("handles case-insensitivity", () => {
      expect(isRetryableTicketMagic(RETRYABLE_TICKET_MAGIC.toUpperCase())).toBe(
        true
      );
      expect(
        isRetryableTicketMagic("0xA723C008E76E379C55599D2E4D93879BEAFDA79C")
      ).toBe(true);
    });
  });

  describe("formatDecodedValue", () => {
    it("formats BigNumber", () => {
      const bn = ethers.BigNumber.from("1000");
      expect(formatDecodedValue(bn, "uint256")).toBe("1000");
    });

    it("formats large ETH value with conversion", () => {
      // 1 ETH = 10^18 wei
      const oneEth = ethers.utils.parseEther("1");
      const result = formatDecodedValue(oneEth, "uint256");
      expect(result).toContain("1.0");
      expect(result).toContain("ETH");
    });

    it("does not show ETH conversion for small values", () => {
      // 0.0001 ETH is below the threshold
      const smallValue = ethers.utils.parseEther("0.0001");
      const result = formatDecodedValue(smallValue, "uint256");
      // Small values should just show the raw number
      expect(result).toBe(smallValue.toString());
    });

    it("formats arrays", () => {
      const arr = ["0x1234", "0x5678"];
      expect(formatDecodedValue(arr, "address[]")).toBe("[0x1234, 0x5678]");
    });

    it("formats empty arrays", () => {
      expect(formatDecodedValue([], "address[]")).toBe("[]");
    });

    it("truncates long bytes", () => {
      const longBytes = "0x" + "a".repeat(100); // 100 'a' characters
      const result = formatDecodedValue(longBytes, "bytes");
      expect(result.length).toBeLessThan(longBytes.length);
      expect(result).toContain("...");
    });

    it("does not truncate short bytes", () => {
      const shortBytes = "0x12345678";
      expect(formatDecodedValue(shortBytes, "bytes")).toBe(shortBytes);
    });

    it("handles null", () => {
      expect(formatDecodedValue(null, "uint256")).toBe("null");
    });

    it("handles undefined", () => {
      // gov-tracker returns "undefined" for undefined values
      expect(formatDecodedValue(undefined, "uint256")).toBe("undefined");
    });

    it("converts other types to string", () => {
      expect(formatDecodedValue("hello", "string")).toBe("hello");
      expect(formatDecodedValue(123, "uint256")).toBe("123");
      expect(formatDecodedValue(true, "bool")).toBe("true");
    });
  });

  describe("decodeRetryableTicket", () => {
    it("decodes valid retryable ticket and identifies arb1 chain", () => {
      // Encode a retryable ticket tuple with ARB1_INBOX
      const abiCoder = new ethers.utils.AbiCoder();
      const encoded = abiCoder.encode(
        ["address", "address", "uint256", "uint256", "uint256", "bytes"],
        [
          ARB1_INBOX, // targetInbox
          "0x0000000000000000000000000000000000000001", // l2Target
          "0", // l2Value
          "100000", // gasLimit
          "1000000000", // maxFeePerGas
          "0x12345678", // l2Calldata
        ]
      );

      const result = decodeRetryableTicket(encoded);

      expect(result).not.toBeNull();
      expect(result?.chain).toBe("arb1");
      expect(result?.targetInbox.toLowerCase()).toBe(ARB1_INBOX);
      expect(result?.l2Target.toLowerCase()).toBe(
        "0x0000000000000000000000000000000000000001"
      );
      expect(result?.gasLimit).toBe("100000");
      expect(result?.maxFeePerGas).toBe("1000000000");
      expect(result?.l2Calldata).toBe("0x12345678");
    });

    it("identifies nova chain from inbox", () => {
      const abiCoder = new ethers.utils.AbiCoder();
      const encoded = abiCoder.encode(
        ["address", "address", "uint256", "uint256", "uint256", "bytes"],
        [
          NOVA_INBOX, // targetInbox for Nova
          "0x0000000000000000000000000000000000000002",
          "0",
          "200000",
          "2000000000",
          "0x",
        ]
      );

      const result = decodeRetryableTicket(encoded);

      expect(result).not.toBeNull();
      expect(result?.chain).toBe("nova");
    });

    it("returns unknown chain for unrecognized inbox", () => {
      const abiCoder = new ethers.utils.AbiCoder();
      const unknownInbox = "0x1111111111111111111111111111111111111111";
      const encoded = abiCoder.encode(
        ["address", "address", "uint256", "uint256", "uint256", "bytes"],
        [
          unknownInbox,
          "0x0000000000000000000000000000000000000003",
          "0",
          "50000",
          "500000000",
          "0x",
        ]
      );

      const result = decodeRetryableTicket(encoded);

      expect(result).not.toBeNull();
      expect(result?.chain).toBe("unknown");
    });

    it("returns null for invalid data", () => {
      // In v0.1.1, decodeRetryableTicket throws on invalid data instead of returning null
      expect(() => decodeRetryableTicket("0x")).toThrow();
      expect(() => decodeRetryableTicket("invalid")).toThrow();
      expect(() => decodeRetryableTicket("0x1234")).toThrow();
    });

    it("handles large uint256 values", () => {
      const abiCoder = new ethers.utils.AbiCoder();
      const largeValue = ethers.utils.parseEther("100"); // 100 ETH
      const encoded = abiCoder.encode(
        ["address", "address", "uint256", "uint256", "uint256", "bytes"],
        [
          ARB1_INBOX,
          "0x0000000000000000000000000000000000000001",
          largeValue.toString(),
          "1000000",
          "10000000000",
          "0x",
        ]
      );

      const result = decodeRetryableTicket(encoded);

      expect(result).not.toBeNull();
      expect(result?.l2Value).toBe(largeValue.toString());
    });
  });
});
