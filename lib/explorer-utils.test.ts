import { describe, expect, it } from "vitest";

import {
  getAddressExplorerUrl,
  getExplorerBaseUrl,
  getExplorerName,
  getTxExplorerUrl,
} from "./explorer-utils";

describe("explorer-utils", () => {
  const sampleAddress = "0x912CE59144191C1204E64559FE8253a0e49E6548";
  const sampleTxHash =
    "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";

  describe("getExplorerBaseUrl", () => {
    it("returns Etherscan URL for ethereum", () => {
      expect(getExplorerBaseUrl("ethereum")).toBe("https://etherscan.io");
    });

    it("returns Arbiscan URL for arb1", () => {
      expect(getExplorerBaseUrl("arb1")).toBe("https://arbiscan.io");
    });

    it("returns Nova Explorer URL for nova", () => {
      expect(getExplorerBaseUrl("nova")).toBe("https://nova.arbiscan.io");
    });
  });

  describe("getAddressExplorerUrl", () => {
    it("returns Arbiscan address URL by default", () => {
      const url = getAddressExplorerUrl(sampleAddress);
      expect(url).toBe(`https://arbiscan.io/address/${sampleAddress}`);
    });

    it("returns Etherscan address URL for ethereum chain", () => {
      const url = getAddressExplorerUrl(sampleAddress, "ethereum");
      expect(url).toBe(`https://etherscan.io/address/${sampleAddress}`);
    });

    it("returns Arbiscan address URL for arb1 chain", () => {
      const url = getAddressExplorerUrl(sampleAddress, "arb1");
      expect(url).toBe(`https://arbiscan.io/address/${sampleAddress}`);
    });

    it("returns Nova Explorer address URL for nova chain", () => {
      const url = getAddressExplorerUrl(sampleAddress, "nova");
      expect(url).toBe(`https://nova.arbiscan.io/address/${sampleAddress}`);
    });
  });

  describe("getTxExplorerUrl", () => {
    it("returns Arbiscan tx URL by default", () => {
      const url = getTxExplorerUrl(sampleTxHash);
      expect(url).toBe(`https://arbiscan.io/tx/${sampleTxHash}`);
    });

    it("returns Etherscan tx URL for ethereum chain", () => {
      const url = getTxExplorerUrl(sampleTxHash, "ethereum");
      expect(url).toBe(`https://etherscan.io/tx/${sampleTxHash}`);
    });

    it("returns Arbiscan tx URL for arb1 chain", () => {
      const url = getTxExplorerUrl(sampleTxHash, "arb1");
      expect(url).toBe(`https://arbiscan.io/tx/${sampleTxHash}`);
    });

    it("returns Nova Explorer tx URL for nova chain", () => {
      const url = getTxExplorerUrl(sampleTxHash, "nova");
      expect(url).toBe(`https://nova.arbiscan.io/tx/${sampleTxHash}`);
    });
  });

  describe("getExplorerName", () => {
    it("returns Etherscan for ethereum", () => {
      expect(getExplorerName("ethereum")).toBe("Etherscan");
    });

    it("returns Arbiscan for arb1", () => {
      expect(getExplorerName("arb1")).toBe("Arbiscan");
    });

    it("returns Nova Explorer for nova", () => {
      expect(getExplorerName("nova")).toBe("Nova Explorer");
    });
  });
});
