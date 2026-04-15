import { describe, expect, it } from "vitest";

import {
  extractProposalTitle,
  stripMarkdownAndHtml,
  truncateMiddle,
  truncateText,
} from "./text-utils";

describe("text-utils", () => {
  describe("stripMarkdownAndHtml", () => {
    it("removes HTML tags", () => {
      expect(stripMarkdownAndHtml("<p>Hello</p>")).toBe("Hello");
      expect(stripMarkdownAndHtml("<div><span>Test</span></div>")).toBe("Test");
    });

    it("removes HTML attributes", () => {
      expect(stripMarkdownAndHtml('<a href="test">Link</a>')).toBe("Link");
      expect(stripMarkdownAndHtml('<img src="image.png" alt="Alt text">')).toBe(
        ""
      );
    });

    it("removes markdown bold syntax", () => {
      expect(stripMarkdownAndHtml("**bold text**")).toBe("bold text");
      expect(stripMarkdownAndHtml("__bold text__")).toBe("bold text");
    });

    it("removes markdown italic syntax", () => {
      expect(stripMarkdownAndHtml("*italic*")).toBe("italic");
      expect(stripMarkdownAndHtml("_italic_")).toBe("italic");
    });

    it("removes markdown links", () => {
      expect(stripMarkdownAndHtml("[link text](https://example.com)")).toBe("");
      expect(stripMarkdownAndHtml("[GitHub](https://github.com)")).toBe("");
    });

    it("removes markdown code syntax", () => {
      expect(stripMarkdownAndHtml("`code`")).toBe("code");
      expect(stripMarkdownAndHtml("```\ncode block\n```")).toBe(
        "\ncode block\n"
      );
    });

    it("removes markdown headers", () => {
      expect(stripMarkdownAndHtml("# Header")).toBe(" Header");
      expect(stripMarkdownAndHtml("## Subheader")).toBe(" Subheader");
    });

    it("removes markdown blockquotes", () => {
      expect(stripMarkdownAndHtml("> Quote")).toBe(" Quote");
    });

    it("handles empty string", () => {
      expect(stripMarkdownAndHtml("")).toBe("");
    });

    it("handles plain text", () => {
      expect(stripMarkdownAndHtml("Plain text")).toBe("Plain text");
    });

    it("handles mixed content", () => {
      const input = "<p>**Bold** and *italic* with [link](url)</p>";
      const result = stripMarkdownAndHtml(input);
      expect(result).toBe("Bold and italic with ");
    });
  });

  describe("truncateText", () => {
    it("truncates text longer than maxLength", () => {
      const text = "This is a long text that needs to be truncated";
      expect(truncateText(text, 20)).toBe("This is a long text ...");
    });

    it("keeps text shorter than maxLength unchanged", () => {
      const text = "Short text";
      expect(truncateText(text, 20)).toBe("Short text");
    });

    it("truncates text equal to maxLength", () => {
      const text = "12345";
      expect(truncateText(text, 5)).toBe("12345");
    });

    it("uses default maxLength of 150", () => {
      const shortText = "Short";
      expect(truncateText(shortText)).toBe("Short");

      const longText = "a".repeat(200);
      expect(truncateText(longText)).toBe("a".repeat(150) + "...");
    });

    it("handles empty string", () => {
      expect(truncateText("")).toBe("");
      expect(truncateText("", 10)).toBe("");
    });

    it("handles maxLength of 0", () => {
      expect(truncateText("Hello", 0)).toBe("...");
    });

    it("handles maxLength of 1", () => {
      expect(truncateText("Hello", 1)).toBe("H...");
    });
  });

  describe("extractProposalTitle", () => {
    it("uses the title before the non-constitutional boilerplate", () => {
      const description = `# Proposal to Establish the Arbitrum Research & Development Collective
This is a Non-Constitutional proposal.

**Abstract** - This proposal aims to fund the collective.`;

      expect(extractProposalTitle(description)).toBe(
        "Proposal to Establish the Arbitrum Research & Development Collective"
      );
    });

    it("deduplicates repeated headings before non-constitutional", () => {
      const description = `# AIP-7: Arbitrum One Governance Parameter Fixes
# AIP-7: Arbitrum One Governance Parameter Fixes

## Non-Constitutional

## Abstract
Three independent issues have been identified.`;

      expect(extractProposalTitle(description)).toBe(
        "AIP-7: Arbitrum One Governance Parameter Fixes"
      );
    });

    it("stops before abstract and ignores amendment metadata", () => {
      const description = `# [UPDATED] Proposal to Establish the Arbitrum Research & Development Collective
**Amendments in light of community feedback:**

* Standard 50,000 ARB for the DAO Advocate role.

**Abstract** - This proposal aims to fund the collective.`;

      expect(extractProposalTitle(description)).toBe(
        "[UPDATED] Proposal to Establish the Arbitrum Research & Development Collective"
      );
    });

    it("ignores constitutional metadata lines before abstract", () => {
      const description = `# AIP: ArbOS Version 11

# Constitutional

## Abstract

This AIP introduces a number of improvements.`;

      expect(extractProposalTitle(description)).toBe("AIP: ArbOS Version 11");
    });

    it("does not truncate at the spaced dash delimiter when the prefix is short", () => {
      const description = `# AIP-1.2 - Foundation and DAO Governance
Category: Constitutional - Process

## Abstract:
This document proposes amendments.`;

      expect(extractProposalTitle(description)).toBe(
        "AIP-1.2 - Foundation and DAO Governance"
      );
    });

    it("truncates at the spaced dash delimiter when the prefix is long", () => {
      const description = `# Experimental Delegates Incentive System
# Final Version with Option 2 (Karma)

## Abstract

We introduce an experimental incentive system.`;

      expect(extractProposalTitle(description)).toBe(
        "Experimental Delegates Incentive System"
      );
    });

    it("does not truncate when the prefix before the spaced dash is short", () => {
      const description = `# [UPDATED] - Proposal to Establish the Arbitrum Research & Development Collective

## Abstract

This proposal aims to fund the collective.`;

      expect(extractProposalTitle(description)).toBe(
        "[UPDATED] - Proposal to Establish the Arbitrum Research & Development Collective"
      );
    });

    it("falls back to the explicit proposal title line when needed", () => {
      const description = `**Title**

Proposal: Activate support for account abstraction endpoint on One and Nova

**Author**

Jason Windawi

**Abstract**

As part of the broader development of account abstraction standards.`;

      expect(extractProposalTitle(description)).toBe(
        "Activate support for account abstraction endpoint on One and Nova"
      );
    });
  });

  describe("truncateMiddle", () => {
    it("truncates long strings in the middle", () => {
      const text = "0x1234567890abcdef1234567890abcdef12345678";
      expect(truncateMiddle(text, 10, 8)).toBe("0x12345678...12345678");
    });

    it("keeps short strings unchanged", () => {
      expect(truncateMiddle("short")).toBe("short");
      expect(truncateMiddle("0x1234567890")).toBe("0x1234567890");
    });

    it("uses default values (10 start, 8 end)", () => {
      const text = "0x1234567890abcdef1234567890abcdef12345678";
      expect(truncateMiddle(text)).toBe("0x12345678...12345678");
    });

    it("handles edge case where text equals minimum length", () => {
      // minLength = 10 + 8 + 3 = 21
      const text = "123456789012345678901"; // 21 chars
      expect(truncateMiddle(text)).toBe(text);
    });

    it("truncates text just above minimum length", () => {
      // minLength = 10 + 8 + 3 = 21
      const text = "12345678901234567890ab"; // 22 chars
      expect(truncateMiddle(text)).toBe("1234567890...567890ab");
    });

    it("handles custom start and end chars", () => {
      const text = "0x1234567890abcdef1234567890abcdef12345678";
      expect(truncateMiddle(text, 6, 4)).toBe("0x1234...5678");
      expect(truncateMiddle(text, 34, 32)).toBe(text); // under minLength
    });

    it("handles empty string", () => {
      expect(truncateMiddle("")).toBe("");
    });

    it("handles hash truncation like tx hashes", () => {
      const txHash =
        "0xdfebb93861904590d6d538d48071a96137f66b7a947431a7d74d62a59ce182ec";
      expect(truncateMiddle(txHash, 10, 8)).toBe("0xdfebb938...9ce182ec");
    });
  });
});
