import { describe, expect, it } from "vitest";

import { siteConfig } from "./site";

describe("site config", () => {
  describe("siteConfig", () => {
    it("has required properties", () => {
      expect(siteConfig.name).toBeDefined();
      expect(siteConfig.description).toBeDefined();
      expect(siteConfig.url).toBeDefined();
      expect(siteConfig.ogImage).toBeDefined();
      expect(siteConfig.links).toBeDefined();
      expect(siteConfig.manifest).toBeDefined();
    });

    it("has correct name", () => {
      expect(siteConfig.name).toBe("Arbitrum Governance");
    });

    it("has correct description", () => {
      expect(siteConfig.description).toBe("Vote on ArbitrumDAO proposals");
    });

    it("has valid base URL", () => {
      expect(siteConfig.url).toBe("https://alt.gov.arbitrum.foundation");
    });

    it("has ogImage with correct base URL", () => {
      expect(siteConfig.ogImage).toContain(
        "https://alt.gov.arbitrum.foundation"
      );
      expect(siteConfig.ogImage).toContain("opengraph-image.jpg");
    });

    it("has manifest with correct base URL", () => {
      expect(siteConfig.manifest).toContain(
        "https://alt.gov.arbitrum.foundation"
      );
      expect(siteConfig.manifest).toContain("site.webmanifest");
    });

    describe("links", () => {
      it("has twitter link", () => {
        expect(siteConfig.links.twitter).toBe("https://twitter.com/arbitrum");
      });

      it("has github link", () => {
        expect(siteConfig.links.github).toBe(
          "https://github.com/offchainlabs/tally-zero"
        );
      });

      it("all links are valid URLs", () => {
        Object.values(siteConfig.links).forEach((link) => {
          expect(link).toMatch(/^https?:\/\//);
        });
      });
    });
  });
});
