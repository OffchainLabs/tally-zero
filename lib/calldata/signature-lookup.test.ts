/**
 * Tests for calldata signature-lookup utilities
 */

import { describe, expect, it } from "vitest";

import { lookupLocalSignature } from "./signature-lookup";

describe("lookupLocalSignature", () => {
  it("returns signature for known selector (lowercase)", () => {
    expect(lookupLocalSignature("0xa9059cbb")).toBe(
      "transfer(address,uint256)"
    );
    expect(lookupLocalSignature("0x095ea7b3")).toBe("approve(address,uint256)");
    expect(lookupLocalSignature("0x23b872dd")).toBe(
      "transferFrom(address,address,uint256)"
    );
  });

  it("returns signature for known selector (uppercase)", () => {
    expect(lookupLocalSignature("0xA9059CBB")).toBe(
      "transfer(address,uint256)"
    );
    expect(lookupLocalSignature("0x095EA7B3")).toBe("approve(address,uint256)");
  });

  it("returns signature for known selector (mixed case)", () => {
    expect(lookupLocalSignature("0xA9059cBb")).toBe(
      "transfer(address,uint256)"
    );
  });

  it("returns governance function signatures", () => {
    expect(lookupLocalSignature("0x1cff79cd")).toBe("execute(address,bytes)");
    expect(lookupLocalSignature("0x01d5062a")).toBe(
      "schedule(address,uint256,bytes,bytes32,bytes32,uint256)"
    );
    expect(lookupLocalSignature("0xc4d252f5")).toBe("cancel(bytes32)");
  });

  it("returns null for unknown selector", () => {
    expect(lookupLocalSignature("0x00000000")).toBeNull();
    expect(lookupLocalSignature("0xdeadbeef")).toBeNull();
    expect(lookupLocalSignature("0x12345678")).toBeNull();
  });

  it("returns upgrade function signatures", () => {
    expect(lookupLocalSignature("0x3659cfe6")).toBe("upgradeTo(address)");
    expect(lookupLocalSignature("0x4f1ef286")).toBe(
      "upgradeToAndCall(address,bytes)"
    );
  });

  it("returns ownership function signatures", () => {
    expect(lookupLocalSignature("0x715018a6")).toBe("renounceOwnership()");
    expect(lookupLocalSignature("0xf2fde38b")).toBe(
      "transferOwnership(address)"
    );
  });
});
