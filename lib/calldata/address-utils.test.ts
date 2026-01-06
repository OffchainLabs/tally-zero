/**
 * Tests for calldata address utilities
 */

import { describe, expect, it } from "vitest";

import { getAddressLabel, getChainLabel } from "./address-utils";

describe("getChainLabel", () => {
  it("returns 'Arb1' for arb1", () => {
    expect(getChainLabel("arb1")).toBe("Arb1");
  });

  it("returns 'Nova' for nova", () => {
    expect(getChainLabel("nova")).toBe("Nova");
  });

  it("returns 'L1' for ethereum", () => {
    expect(getChainLabel("ethereum")).toBe("L1");
  });
});

describe("getAddressLabel", () => {
  // Known arb1 addresses
  it("returns label for known arb1 address (exact case match)", () => {
    expect(
      getAddressLabel("0xf07DeD9dC292157749B6Fd268E37DF6EA38395B9", "arb1")
    ).toBe("Core Governor");
  });

  it("returns label for known arb1 address (case insensitive)", () => {
    expect(
      getAddressLabel("0xf07ded9dc292157749b6fd268e37df6ea38395b9", "arb1")
    ).toBe("Core Governor");
  });

  it("returns label for Treasury Governor", () => {
    expect(
      getAddressLabel("0x789fC99093B09aD01C34DC7251D0C89ce743e5a4", "arb1")
    ).toBe("Treasury Governor");
  });

  it("returns label for ARB Token", () => {
    expect(
      getAddressLabel("0x912CE59144191C1204E64559FE8253a0e49E6548", "arb1")
    ).toBe("ARB Token");
  });

  // Known nova addresses
  it("returns label for known nova address", () => {
    expect(
      getAddressLabel("0x86a02dD71363c440b21F4c0E5B2Ad01Ffe1A7482", "nova")
    ).toBe("Nova UpgradeExecutor");
  });

  // Known ethereum addresses
  it("returns label for known ethereum address", () => {
    expect(
      getAddressLabel("0xE6841D92B0C345144506576eC13ECf5103aC7f49", "ethereum")
    ).toBe("L1 Timelock");
  });

  it("returns label for Arb1 Delayed Inbox", () => {
    expect(
      getAddressLabel("0x4Dbd4fc535Ac27206064B68FfCf827b0A60BAB3f", "ethereum")
    ).toBe("Arb1 Delayed Inbox");
  });

  // Unknown addresses
  it("returns undefined for unknown address", () => {
    expect(
      getAddressLabel("0x0000000000000000000000000000000000000001", "arb1")
    ).toBeUndefined();
  });

  it("returns undefined for known arb1 address on wrong chain", () => {
    // Core Governor only exists on arb1, not ethereum
    expect(
      getAddressLabel("0xf07DeD9dC292157749B6Fd268E37DF6EA38395B9", "ethereum")
    ).toBeUndefined();
  });
});
