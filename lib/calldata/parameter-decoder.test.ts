/**
 * Tests for calldata parameter-decoder utilities
 */

import { describe, expect, it } from "vitest";

import {
  formatDecodedValue,
  isLikelyCalldata,
  parseParamTypes,
} from "./parameter-decoder";

describe("parseParamTypes", () => {
  it("returns empty array for empty string", () => {
    expect(parseParamTypes("")).toEqual([]);
    expect(parseParamTypes("   ")).toEqual([]);
  });

  it("parses single type", () => {
    expect(parseParamTypes("address")).toEqual(["address"]);
    expect(parseParamTypes("uint256")).toEqual(["uint256"]);
    expect(parseParamTypes("bytes")).toEqual(["bytes"]);
  });

  it("parses multiple simple types", () => {
    expect(parseParamTypes("address,uint256")).toEqual(["address", "uint256"]);
    expect(parseParamTypes("address, uint256, bytes")).toEqual([
      "address",
      "uint256",
      "bytes",
    ]);
  });

  it("handles array types", () => {
    expect(parseParamTypes("address[]")).toEqual(["address[]"]);
    expect(parseParamTypes("uint256[],bytes32")).toEqual([
      "uint256[]",
      "bytes32",
    ]);
    expect(parseParamTypes("address[],uint256[],bytes[]")).toEqual([
      "address[]",
      "uint256[]",
      "bytes[]",
    ]);
  });

  it("handles nested tuple types", () => {
    expect(parseParamTypes("(address,uint256)")).toEqual(["(address,uint256)"]);
    expect(parseParamTypes("address,(uint256,bytes)")).toEqual([
      "address",
      "(uint256,bytes)",
    ]);
  });

  it("handles deeply nested tuples", () => {
    expect(parseParamTypes("((address,uint256),bytes)")).toEqual([
      "((address,uint256),bytes)",
    ]);
  });

  it("handles tuple arrays", () => {
    expect(parseParamTypes("(address,uint256)[]")).toEqual([
      "(address,uint256)[]",
    ]);
  });
});

describe("isLikelyCalldata", () => {
  it("returns false for non-hex values", () => {
    expect(isLikelyCalldata("hello")).toBe(false);
    expect(isLikelyCalldata("123456")).toBe(false);
  });

  it("returns false for values not starting with 0x", () => {
    expect(isLikelyCalldata("a9059cbb")).toBe(false);
  });

  it("returns false for short hex values", () => {
    expect(isLikelyCalldata("0x")).toBe(false);
    expect(isLikelyCalldata("0x1234")).toBe(false);
    expect(isLikelyCalldata("0x123456")).toBe(false); // Only 6 chars, need 8
  });

  it("returns true for valid function selector", () => {
    expect(isLikelyCalldata("0xa9059cbb")).toBe(true); // transfer selector
    expect(isLikelyCalldata("0x23b872dd")).toBe(true); // transferFrom selector
  });

  it("returns true for full calldata", () => {
    // transfer(address,uint256)
    expect(
      isLikelyCalldata(
        "0xa9059cbb000000000000000000000000f07ded9dc292157749b6fd268e37df6ea38395b9000000000000000000000000000000000000000000000000000000000000000a"
      )
    ).toBe(true);
  });

  it("returns false for invalid hex characters", () => {
    expect(isLikelyCalldata("0xZZZZZZZZ")).toBe(false);
    expect(isLikelyCalldata("0x1234567G")).toBe(false);
  });
});

describe("formatDecodedValue", () => {
  it("handles null and undefined", () => {
    expect(formatDecodedValue(null, "address")).toBe("null");
    expect(formatDecodedValue(undefined, "uint256")).toBe("null");
  });

  it("formats strings", () => {
    expect(
      formatDecodedValue(
        "0xf07DeD9dC292157749B6Fd268E37DF6EA38395B9",
        "address"
      )
    ).toBe("0xf07DeD9dC292157749B6Fd268E37DF6EA38395B9");
  });

  it("formats empty arrays", () => {
    expect(formatDecodedValue([], "address[]")).toBe("[]");
  });

  it("formats simple arrays", () => {
    expect(formatDecodedValue(["a", "b", "c"], "string[]")).toBe("[a, b, c]");
  });

  it("formats nested arrays", () => {
    expect(formatDecodedValue(["0xaddr1", "0xaddr2"], "address[]")).toBe(
      "[0xaddr1, 0xaddr2]"
    );
  });

  it("truncates long bytes values", () => {
    const longBytes = "0x" + "a".repeat(100);
    const result = formatDecodedValue(longBytes, "bytes");
    expect(result.length).toBeLessThan(longBytes.length);
    expect(result).toContain("...");
  });
});
