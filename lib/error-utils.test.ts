import { describe, expect, it } from "vitest";

import {
  getErrorMessage,
  getProposalCancelSimulationErrorMessage,
  isUserRejectedError,
  toError,
} from "./error-utils";

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

  describe("getProposalCancelSimulationErrorMessage", () => {
    it("returns cancellation-specific simulation errors", () => {
      expect(
        getProposalCancelSimulationErrorMessage(
          new Error("execution reverted: only proposer")
        )
      ).toBe("Only the proposal creator can cancel this proposal.");
      expect(
        getProposalCancelSimulationErrorMessage(
          new Error("execution reverted: proposal not pending")
        )
      ).toBe("Proposal cancellation is only available before voting starts.");
      expect(
        getProposalCancelSimulationErrorMessage(
          new Error("Governor: too late to cancel")
        )
      ).toBe("Proposal cancellation is only available before voting starts.");
      expect(
        getProposalCancelSimulationErrorMessage(
          new Error("Governor: unknown proposal id")
        )
      ).toBe(
        "Proposal data does not match the on-chain proposal. Cannot cancel."
      );
    });

    it("falls back to a generic message when no error is provided", () => {
      expect(getProposalCancelSimulationErrorMessage(undefined)).toBe(
        "Unable to prepare cancellation transaction."
      );
      expect(getProposalCancelSimulationErrorMessage(null)).toBe(
        "Unable to prepare cancellation transaction."
      );
    });
  });

  describe("isUserRejectedError", () => {
    it("detects user rejection codes", () => {
      expect(isUserRejectedError({ code: 4001 })).toBe(true);
      expect(isUserRejectedError({ code: "ACTION_REJECTED" })).toBe(true);
    });

    it("detects common user rejection messages", () => {
      expect(isUserRejectedError(new Error("User rejected the request"))).toBe(
        true
      );
      expect(isUserRejectedError("user denied transaction signature")).toBe(
        true
      );
      expect(isUserRejectedError("request rejected")).toBe(true);
    });

    it("ignores unrelated errors and empty values", () => {
      expect(isUserRejectedError(null)).toBe(false);
      expect(isUserRejectedError(undefined)).toBe(false);
      expect(isUserRejectedError(new Error("RPC unavailable"))).toBe(false);
      expect(
        isUserRejectedError({ code: -32000, message: "execution reverted" })
      ).toBe(false);
    });
  });
});
