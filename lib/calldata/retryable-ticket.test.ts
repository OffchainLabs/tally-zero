/**
 * Tests for calldata retryable-ticket utilities
 */

import { describe, expect, it } from "vitest";

import { isRetryableTicketMagic } from "./retryable-ticket";

describe("isRetryableTicketMagic", () => {
  const MAGIC_ADDRESS = "0xa723c008e76e379c55599d2e4d93879beafda79c";

  it("returns true for magic address (lowercase)", () => {
    expect(isRetryableTicketMagic(MAGIC_ADDRESS)).toBe(true);
  });

  it("returns true for magic address (uppercase)", () => {
    expect(isRetryableTicketMagic(MAGIC_ADDRESS.toUpperCase())).toBe(true);
  });

  it("returns true for magic address (mixed case)", () => {
    expect(
      isRetryableTicketMagic("0xA723C008E76e379C55599D2E4d93879BEaFda79C")
    ).toBe(true);
  });

  it("returns false for non-magic addresses", () => {
    expect(
      isRetryableTicketMagic("0xf07DeD9dC292157749B6Fd268E37DF6EA38395B9")
    ).toBe(false);
    expect(
      isRetryableTicketMagic("0x0000000000000000000000000000000000000000")
    ).toBe(false);
    expect(
      isRetryableTicketMagic("0x4Dbd4fc535Ac27206064B68FfCf827b0A60BAB3f")
    ).toBe(false);
  });

  it("returns false for partial match", () => {
    expect(isRetryableTicketMagic("0xa723c008e76e379c55599d2e4d93879b")).toBe(
      false
    );
  });
});
