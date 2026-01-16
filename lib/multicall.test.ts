import { ethers } from "ethers";
import { describe, expect, it } from "vitest";

import { decodeResult, encodeCall, MULTICALL3_ADDRESS } from "./multicall";

describe("multicall", () => {
  describe("MULTICALL3_ADDRESS", () => {
    it("is the canonical Multicall3 address", () => {
      expect(MULTICALL3_ADDRESS).toBe(
        "0xcA11bde05977b3631167028862bE2a173976CA11"
      );
    });

    it("is a valid checksum address", () => {
      expect(ethers.utils.isAddress(MULTICALL3_ADDRESS)).toBe(true);
      expect(ethers.utils.getAddress(MULTICALL3_ADDRESS)).toBe(
        MULTICALL3_ADDRESS
      );
    });
  });

  describe("encodeCall", () => {
    const ERC20_ABI = [
      "function balanceOf(address owner) view returns (uint256)",
    ];
    const iface = new ethers.utils.Interface(ERC20_ABI);

    it("encodes a function call correctly", () => {
      const calldata = encodeCall(iface, "balanceOf", [
        "0x1234567890123456789012345678901234567890",
      ]);

      expect(calldata).toMatch(/^0x/);
      expect(calldata.length).toBe(74); // 4 bytes selector + 32 bytes address = 36 bytes = 72 hex + 0x
    });

    it("produces deterministic output", () => {
      const addr = "0x1234567890123456789012345678901234567890";
      const call1 = encodeCall(iface, "balanceOf", [addr]);
      const call2 = encodeCall(iface, "balanceOf", [addr]);

      expect(call1).toBe(call2);
    });
  });

  describe("decodeResult", () => {
    const ERC20_ABI = [
      "function balanceOf(address owner) view returns (uint256)",
    ];
    const iface = new ethers.utils.Interface(ERC20_ABI);

    it("decodes a uint256 result correctly", () => {
      // Encode a known value
      const encoded = ethers.utils.defaultAbiCoder.encode(
        ["uint256"],
        [ethers.BigNumber.from("1000000000000000000")]
      );

      const result = decodeResult<ethers.BigNumber>(
        iface,
        "balanceOf",
        encoded
      );

      expect(result.toString()).toBe("1000000000000000000");
    });

    it("decodes zero correctly", () => {
      const encoded = ethers.utils.defaultAbiCoder.encode(
        ["uint256"],
        [ethers.BigNumber.from("0")]
      );

      const result = decodeResult<ethers.BigNumber>(
        iface,
        "balanceOf",
        encoded
      );

      expect(result.toString()).toBe("0");
    });
  });

  describe("encodeCall + decodeResult roundtrip", () => {
    const BOOL_ABI = [
      "function hasVoted(uint256 proposalId, address account) view returns (bool)",
    ];
    const iface = new ethers.utils.Interface(BOOL_ABI);

    it("encodes hasVoted call correctly", () => {
      const calldata = encodeCall(iface, "hasVoted", [
        "12345",
        "0x1234567890123456789012345678901234567890",
      ]);

      expect(calldata).toMatch(/^0x/);
      // 4 bytes selector + 32 bytes uint256 + 32 bytes address = 68 bytes = 136 hex + 0x
      expect(calldata.length).toBe(138);
    });

    it("decodes boolean true correctly", () => {
      const encoded = ethers.utils.defaultAbiCoder.encode(["bool"], [true]);
      const result = decodeResult<boolean>(iface, "hasVoted", encoded);
      expect(result).toBe(true);
    });

    it("decodes boolean false correctly", () => {
      const encoded = ethers.utils.defaultAbiCoder.encode(["bool"], [false]);
      const result = decodeResult<boolean>(iface, "hasVoted", encoded);
      expect(result).toBe(false);
    });
  });
});
