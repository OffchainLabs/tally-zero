import { describe, expect, it } from "vitest";

import { getErrorMessage, toError } from "./error-utils";

describe("error-utils", () => {
  describe("toError", () => {
    it("returns the same Error if given an Error", () => {
      const original = new Error("test error");
      const result = toError(original);
      expect(result).toBe(original);
      expect(result.message).toBe("test error");
    });

    it("wraps a string in an Error", () => {
      const result = toError("string error");
      expect(result).toBeInstanceOf(Error);
      expect(result.message).toBe("string error");
    });

    it("extracts message from object with message property", () => {
      const result = toError({ message: "object error" });
      expect(result).toBeInstanceOf(Error);
      expect(result.message).toBe("object error");
    });

    it("handles object with non-string message property", () => {
      const result = toError({ message: 123 });
      expect(result).toBeInstanceOf(Error);
      expect(result.message).toBe("123");
    });

    it("converts number to string error", () => {
      const result = toError(42);
      expect(result).toBeInstanceOf(Error);
      expect(result.message).toBe("42");
    });

    it("converts null to string error", () => {
      const result = toError(null);
      expect(result).toBeInstanceOf(Error);
      expect(result.message).toBe("null");
    });

    it("converts undefined to string error", () => {
      const result = toError(undefined);
      expect(result).toBeInstanceOf(Error);
      expect(result.message).toBe("undefined");
    });

    it("converts boolean to string error", () => {
      const result = toError(false);
      expect(result).toBeInstanceOf(Error);
      expect(result.message).toBe("false");
    });

    it("converts empty object to string error", () => {
      const result = toError({});
      expect(result).toBeInstanceOf(Error);
      expect(result.message).toBe("[object Object]");
    });
  });

  describe("getErrorMessage", () => {
    it("returns message from Error object", () => {
      const error = new Error("error message");
      expect(getErrorMessage(error)).toBe("error message");
    });

    it("returns string error directly", () => {
      expect(getErrorMessage("string error")).toBe("string error");
    });

    it("extracts message from object with message property", () => {
      expect(getErrorMessage({ message: "object error" })).toBe("object error");
    });

    it("handles object with non-string message property", () => {
      expect(getErrorMessage({ message: 456 })).toBe("456");
    });

    it("returns default message for unknown error types", () => {
      expect(getErrorMessage(42)).toBe("An error occurred");
      expect(getErrorMessage(null)).toBe("An error occurred");
      expect(getErrorMessage(undefined)).toBe("An error occurred");
      expect(getErrorMessage({})).toBe("An error occurred");
    });

    it("uses context in fallback message when provided", () => {
      expect(getErrorMessage(42, "fetch data")).toBe("Failed to fetch data");
      expect(getErrorMessage(null, "connect")).toBe("Failed to connect");
    });

    it("ignores context when error has a message", () => {
      expect(getErrorMessage(new Error("actual error"), "context")).toBe(
        "actual error"
      );
      expect(getErrorMessage("string error", "context")).toBe("string error");
    });
  });
});
