import { describe, expect, it } from "vitest";

import { proposalSanitizeSchema } from "./sanitize-schema";

describe("proposalSanitizeSchema", () => {
  describe("tagNames", () => {
    it("allows heading elements", () => {
      expect(proposalSanitizeSchema.tagNames).toContain("h1");
      expect(proposalSanitizeSchema.tagNames).toContain("h2");
      expect(proposalSanitizeSchema.tagNames).toContain("h3");
      expect(proposalSanitizeSchema.tagNames).toContain("h4");
      expect(proposalSanitizeSchema.tagNames).toContain("h5");
      expect(proposalSanitizeSchema.tagNames).toContain("h6");
    });

    it("allows paragraph and text elements", () => {
      expect(proposalSanitizeSchema.tagNames).toContain("p");
      expect(proposalSanitizeSchema.tagNames).toContain("br");
      expect(proposalSanitizeSchema.tagNames).toContain("hr");
      expect(proposalSanitizeSchema.tagNames).toContain("div");
      expect(proposalSanitizeSchema.tagNames).toContain("span");
    });

    it("allows list elements", () => {
      expect(proposalSanitizeSchema.tagNames).toContain("ul");
      expect(proposalSanitizeSchema.tagNames).toContain("ol");
      expect(proposalSanitizeSchema.tagNames).toContain("li");
    });

    it("allows code elements", () => {
      expect(proposalSanitizeSchema.tagNames).toContain("pre");
      expect(proposalSanitizeSchema.tagNames).toContain("code");
      expect(proposalSanitizeSchema.tagNames).toContain("blockquote");
    });

    it("allows text formatting elements", () => {
      expect(proposalSanitizeSchema.tagNames).toContain("strong");
      expect(proposalSanitizeSchema.tagNames).toContain("b");
      expect(proposalSanitizeSchema.tagNames).toContain("em");
      expect(proposalSanitizeSchema.tagNames).toContain("i");
      expect(proposalSanitizeSchema.tagNames).toContain("u");
      expect(proposalSanitizeSchema.tagNames).toContain("s");
      expect(proposalSanitizeSchema.tagNames).toContain("del");
      expect(proposalSanitizeSchema.tagNames).toContain("ins");
      expect(proposalSanitizeSchema.tagNames).toContain("sup");
      expect(proposalSanitizeSchema.tagNames).toContain("sub");
    });

    it("allows link elements", () => {
      expect(proposalSanitizeSchema.tagNames).toContain("a");
    });

    it("allows table elements", () => {
      expect(proposalSanitizeSchema.tagNames).toContain("table");
      expect(proposalSanitizeSchema.tagNames).toContain("thead");
      expect(proposalSanitizeSchema.tagNames).toContain("tbody");
      expect(proposalSanitizeSchema.tagNames).toContain("tfoot");
      expect(proposalSanitizeSchema.tagNames).toContain("tr");
      expect(proposalSanitizeSchema.tagNames).toContain("th");
      expect(proposalSanitizeSchema.tagNames).toContain("td");
      expect(proposalSanitizeSchema.tagNames).toContain("caption");
    });

    it("allows definition list elements", () => {
      expect(proposalSanitizeSchema.tagNames).toContain("dl");
      expect(proposalSanitizeSchema.tagNames).toContain("dt");
      expect(proposalSanitizeSchema.tagNames).toContain("dd");
    });

    it("allows collapsible elements", () => {
      expect(proposalSanitizeSchema.tagNames).toContain("details");
      expect(proposalSanitizeSchema.tagNames).toContain("summary");
    });

    it("does NOT allow dangerous elements", () => {
      expect(proposalSanitizeSchema.tagNames).not.toContain("script");
      expect(proposalSanitizeSchema.tagNames).not.toContain("style");
      expect(proposalSanitizeSchema.tagNames).not.toContain("iframe");
      expect(proposalSanitizeSchema.tagNames).not.toContain("object");
      expect(proposalSanitizeSchema.tagNames).not.toContain("embed");
      expect(proposalSanitizeSchema.tagNames).not.toContain("form");
      expect(proposalSanitizeSchema.tagNames).not.toContain("input");
      expect(proposalSanitizeSchema.tagNames).not.toContain("button");
      expect(proposalSanitizeSchema.tagNames).not.toContain("textarea");
    });

    it("does NOT allow image elements", () => {
      // Images could be used for tracking or malicious purposes
      expect(proposalSanitizeSchema.tagNames).not.toContain("img");
      expect(proposalSanitizeSchema.tagNames).not.toContain("svg");
    });
  });

  describe("attributes", () => {
    it("allows safe link attributes", () => {
      const linkAttrs = proposalSanitizeSchema.attributes?.a;
      expect(linkAttrs).toContain("href");
      expect(linkAttrs).toContain("title");
      expect(linkAttrs).toContain("rel");
      expect(linkAttrs).toContain("target");
    });

    it("allows table cell alignment attributes", () => {
      const thAttrs = proposalSanitizeSchema.attributes?.th;
      expect(thAttrs).toContain("align");
      expect(thAttrs).toContain("valign");
      expect(thAttrs).toContain("scope");

      const tdAttrs = proposalSanitizeSchema.attributes?.td;
      expect(tdAttrs).toContain("align");
      expect(tdAttrs).toContain("valign");
    });

    it("allows className on code elements", () => {
      expect(proposalSanitizeSchema.attributes?.code).toContain("className");
      expect(proposalSanitizeSchema.attributes?.pre).toContain("className");
    });

    it("allows id attribute globally", () => {
      expect(proposalSanitizeSchema.attributes?.["*"]).toContain("id");
    });

    it("does NOT allow event handlers", () => {
      const allAttrs = Object.values(
        proposalSanitizeSchema.attributes ?? {}
      ).flat();
      // Event handlers that could execute JavaScript
      const eventHandlers = [
        "onclick",
        "onload",
        "onerror",
        "onmouseover",
        "onfocus",
      ];
      for (const handler of eventHandlers) {
        expect(allAttrs).not.toContain(handler);
      }
    });
  });

  describe("protocols", () => {
    it("allows safe URL protocols", () => {
      expect(proposalSanitizeSchema.protocols?.href).toContain("http");
      expect(proposalSanitizeSchema.protocols?.href).toContain("https");
      expect(proposalSanitizeSchema.protocols?.href).toContain("mailto");
    });

    it("does NOT allow dangerous protocols", () => {
      const hrefProtocols = proposalSanitizeSchema.protocols?.href ?? [];
      expect(hrefProtocols).not.toContain("javascript");
      expect(hrefProtocols).not.toContain("data");
      expect(hrefProtocols).not.toContain("vbscript");
    });
  });

  describe("strip", () => {
    it("strips dangerous elements entirely", () => {
      expect(proposalSanitizeSchema.strip).toContain("script");
      expect(proposalSanitizeSchema.strip).toContain("style");
    });
  });
});
