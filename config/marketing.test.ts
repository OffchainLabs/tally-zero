import { describe, expect, it } from "vitest";

import { marketingConfig } from "./marketing";

describe("marketing config", () => {
  describe("marketingConfig", () => {
    it("has mainNav property", () => {
      expect(marketingConfig.mainNav).toBeDefined();
      expect(Array.isArray(marketingConfig.mainNav)).toBe(true);
    });

    it("has correct number of nav items", () => {
      expect(marketingConfig.mainNav).toHaveLength(5);
    });

    describe("nav items", () => {
      it("has Proposals nav item", () => {
        const proposals = marketingConfig.mainNav.find(
          (item) => item.title === "Proposals"
        );
        expect(proposals).toBeDefined();
        expect(proposals?.href).toBe("/explore");
      });

      it("has Elections nav item", () => {
        const elections = marketingConfig.mainNav.find(
          (item) => item.title === "Elections"
        );
        expect(elections).toBeDefined();
        expect(elections?.href).toBe("/elections");
      });

      it("has Delegates nav item", () => {
        const delegates = marketingConfig.mainNav.find(
          (item) => item.title === "Delegates"
        );
        expect(delegates).toBeDefined();
        expect(delegates?.href).toBe("/delegates");
      });

      it("has Timelock nav item", () => {
        const timelock = marketingConfig.mainNav.find(
          (item) => item.title === "Timelock"
        );
        expect(timelock).toBeDefined();
        expect(timelock?.href).toBe("/timelock");
      });

      it("has Arbitrum DAO nav item", () => {
        const dao = marketingConfig.mainNav.find(
          (item) => item.title === "Arbitrum DAO"
        );
        expect(dao).toBeDefined();
        expect(dao?.href).toBe("https://arbitrum.foundation/governance");
      });

      it("all nav items have title and href", () => {
        marketingConfig.mainNav.forEach((item) => {
          expect(item.title).toBeDefined();
          expect(typeof item.title).toBe("string");
          expect(item.title.length).toBeGreaterThan(0);

          expect(item.href).toBeDefined();
          expect(typeof item.href).toBe("string");
          expect(item.href.length).toBeGreaterThan(0);
        });
      });

      it("internal links start with /", () => {
        const internalLinks = marketingConfig.mainNav.filter(
          (item) => !item.href.startsWith("http")
        );
        internalLinks.forEach((item) => {
          expect(item.href).toMatch(/^\//);
        });
      });

      it("external links are valid URLs", () => {
        const externalLinks = marketingConfig.mainNav.filter((item) =>
          item.href.startsWith("http")
        );
        externalLinks.forEach((item) => {
          expect(item.href).toMatch(/^https?:\/\//);
        });
      });
    });
  });
});
