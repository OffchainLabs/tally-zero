/**
 * Tests for use-url-state parsing and building utilities
 */

import { describe, expect, it } from "vitest";

import { buildUrlHash, parseUrlHash, type UrlState } from "./use-url-state";

describe("parseUrlHash", () => {
  describe("empty/invalid input", () => {
    it("returns null state for empty string", () => {
      expect(parseUrlHash("")).toEqual({ type: null, id: null });
    });

    it("returns null state for just #", () => {
      expect(parseUrlHash("#")).toEqual({ type: null, id: null });
    });

    it("returns null state for single part", () => {
      expect(parseUrlHash("#proposal")).toEqual({ type: null, id: null });
    });

    it("returns null state for proposal hash", () => {
      expect(parseUrlHash("#proposal/12345")).toEqual({
        type: null,
        id: null,
      });
    });

    it("returns null state for unknown type", () => {
      expect(parseUrlHash("#unknown/123")).toEqual({ type: null, id: null });
    });
  });

  describe("timelock URLs", () => {
    const validTxHash =
      "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";

    it("parses timelock without opIndex", () => {
      expect(parseUrlHash(`#timelock/${validTxHash}`)).toEqual({
        type: "timelock",
        id: validTxHash,
        opIndex: undefined,
      });
    });

    it("parses timelock with opIndex", () => {
      expect(parseUrlHash(`#timelock/${validTxHash}/1`)).toEqual({
        type: "timelock",
        id: validTxHash,
        opIndex: 1,
      });
    });

    it("parses timelock with higher opIndex", () => {
      expect(parseUrlHash(`#timelock/${validTxHash}/5`)).toEqual({
        type: "timelock",
        id: validTxHash,
        opIndex: 5,
      });
    });

    it("ignores zero opIndex", () => {
      expect(parseUrlHash(`#timelock/${validTxHash}/0`)).toEqual({
        type: "timelock",
        id: validTxHash,
        opIndex: undefined,
      });
    });

    it("ignores negative opIndex", () => {
      expect(parseUrlHash(`#timelock/${validTxHash}/-1`)).toEqual({
        type: "timelock",
        id: validTxHash,
        opIndex: undefined,
      });
    });

    it("ignores non-numeric opIndex", () => {
      expect(parseUrlHash(`#timelock/${validTxHash}/abc`)).toEqual({
        type: "timelock",
        id: validTxHash,
        opIndex: undefined,
      });
    });

    it("rejects invalid tx hash", () => {
      expect(parseUrlHash("#timelock/invalid-hash")).toEqual({
        type: null,
        id: null,
      });
    });

    it("rejects short tx hash", () => {
      expect(parseUrlHash("#timelock/0x1234")).toEqual({
        type: null,
        id: null,
      });
    });
  });
});

describe("buildUrlHash", () => {
  describe("empty state", () => {
    it("returns empty string for null type", () => {
      expect(buildUrlHash({ type: null, id: null })).toBe("");
    });

    it("returns empty string for null id", () => {
      expect(buildUrlHash({ type: "timelock", id: null })).toBe("");
    });

    it("returns empty string for both null", () => {
      expect(buildUrlHash({ type: null, id: "123" })).toBe("");
    });
  });

  describe("timelock state", () => {
    const txHash =
      "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";

    it("builds timelock hash without opIndex", () => {
      expect(buildUrlHash({ type: "timelock", id: txHash })).toBe(
        `#timelock/${txHash}`
      );
    });

    it("builds timelock hash with opIndex", () => {
      expect(buildUrlHash({ type: "timelock", id: txHash, opIndex: 1 })).toBe(
        `#timelock/${txHash}/1`
      );
    });

    it("builds timelock hash with higher opIndex", () => {
      expect(buildUrlHash({ type: "timelock", id: txHash, opIndex: 5 })).toBe(
        `#timelock/${txHash}/5`
      );
    });

    it("omits zero opIndex", () => {
      expect(buildUrlHash({ type: "timelock", id: txHash, opIndex: 0 })).toBe(
        `#timelock/${txHash}`
      );
    });

    it("omits negative opIndex", () => {
      expect(buildUrlHash({ type: "timelock", id: txHash, opIndex: -1 })).toBe(
        `#timelock/${txHash}`
      );
    });
  });

  describe("round-trip consistency", () => {
    it("parse and build are inverses for timelock", () => {
      const txHash =
        "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
      const original: UrlState = { type: "timelock", id: txHash, opIndex: 3 };
      const hash = buildUrlHash(original);
      const parsed = parseUrlHash(hash);
      expect(parsed).toEqual(original);
    });
  });
});
