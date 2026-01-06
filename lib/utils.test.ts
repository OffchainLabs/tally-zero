import { describe, expect, it } from "vitest";
import { cn, isValidRpcUrl } from "./utils";

describe("utils", () => {
  describe("cn", () => {
    it("merges class names", () => {
      expect(cn("foo", "bar")).toBe("foo bar");
    });

    it("handles conditional classes", () => {
      expect(cn("foo", false && "bar", "baz")).toBe("foo baz");
      expect(cn("foo", true && "bar", "baz")).toBe("foo bar baz");
    });

    it("removes duplicate Tailwind classes", () => {
      expect(cn("px-2", "px-4")).toBe("px-4");
      expect(cn("text-red-500", "text-blue-500")).toBe("text-blue-500");
    });

    it("handles undefined and null", () => {
      expect(cn("foo", undefined, null, "bar")).toBe("foo bar");
    });

    it("handles arrays", () => {
      expect(cn(["foo", "bar"])).toBe("foo bar");
    });
  });

  describe("isValidRpcUrl", () => {
    it("returns true for empty string", () => {
      expect(isValidRpcUrl("")).toBe(true);
      expect(isValidRpcUrl("  ")).toBe(true);
    });

    it("returns true for valid https URL", () => {
      expect(isValidRpcUrl("https://arb1.arbitrum.io/rpc")).toBe(true);
      expect(isValidRpcUrl("https://mainnet.infura.io/v3/key")).toBe(true);
    });

    it("returns true for valid http URL", () => {
      expect(isValidRpcUrl("http://localhost:8545")).toBe(true);
      expect(isValidRpcUrl("http://127.0.0.1:8545")).toBe(true);
    });

    it("returns false for invalid URL", () => {
      expect(isValidRpcUrl("not-a-url")).toBe(false);
      expect(isValidRpcUrl("just some text")).toBe(false);
    });

    it("returns false for non-http protocol", () => {
      expect(isValidRpcUrl("ws://localhost:8545")).toBe(false);
      expect(isValidRpcUrl("wss://localhost:8545")).toBe(false);
      expect(isValidRpcUrl("ftp://example.com")).toBe(false);
    });
  });
});
