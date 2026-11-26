import { describe, expect, it, vi } from "vitest";

import { resetStoredL1Network } from "./appkit";

vi.mock("@reown/appkit/react", () => ({ createAppKit: vi.fn() }));

const KEY = "@appkit/active_caip_network_id";

function storageWith(value: string | null) {
  const items = new Map<string, string>();
  if (value !== null) items.set(KEY, value);
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: vi.fn((key: string, next: string) => void items.set(key, next)),
    items,
  };
}

/**
 * AppKit connects to the network it stored last time, so a visit that ended
 * on Ethereum would have the next connect ask a wallet on Arbitrum One to
 * switch to Ethereum.
 */
describe("resetStoredL1Network", () => {
  it("starts a visit that ended on Ethereum on Arbitrum One", () => {
    const storage = storageWith("eip155:1");
    resetStoredL1Network(storage);

    expect(storage.items.get(KEY)).toBe("eip155:42161");
  });

  it.each(["eip155:42161", "eip155:421614", "solana:mainnet", "eip155:"])(
    "leaves %s alone",
    (value) => {
      const storage = storageWith(value);
      resetStoredL1Network(storage);

      expect(storage.setItem).not.toHaveBeenCalled();
      expect(storage.items.get(KEY)).toBe(value);
    }
  );

  it("does nothing with no stored network or no storage", () => {
    const storage = storageWith(null);
    resetStoredL1Network(storage);

    expect(storage.setItem).not.toHaveBeenCalled();
    expect(() => resetStoredL1Network(undefined)).not.toThrow();
  });

  it("survives storage that throws", () => {
    const storage = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: vi.fn(),
    };

    expect(() => resetStoredL1Network(storage)).not.toThrow();
  });
});
