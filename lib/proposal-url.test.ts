import { describe, expect, it } from "vitest";

import {
  buildGovernorId,
  buildProposalPath,
  normalizeProposalTab,
  parseGovernorId,
} from "./proposal-url";

describe("proposal-url", () => {
  const governorAddress = "0xf07DeD9dC292157749B6Fd268E37DF6EA38395B9";
  const governorId = `eip155:42161:${governorAddress}`;

  describe("normalizeProposalTab", () => {
    it("returns undefined for empty values", () => {
      expect(normalizeProposalTab(undefined)).toBeUndefined();
      expect(normalizeProposalTab(null)).toBeUndefined();
      expect(normalizeProposalTab("")).toBeUndefined();
    });

    it("maps legacy lifecycle tab to stages", () => {
      expect(normalizeProposalTab("lifecycle")).toBe("stages");
    });

    it("returns supported tabs", () => {
      expect(normalizeProposalTab("description")).toBe("description");
      expect(normalizeProposalTab("payload")).toBe("payload");
      expect(normalizeProposalTab("stages")).toBe("stages");
    });

    it("rejects unsupported tabs", () => {
      expect(normalizeProposalTab("unknown")).toBeUndefined();
    });
  });

  describe("governor ids", () => {
    it("builds a CAIP-style governor id", () => {
      expect(buildGovernorId(governorAddress)).toBe(governorId);
    });

    it("parses a valid governor id", () => {
      expect(parseGovernorId(governorId)).toBe(governorAddress);
    });

    it("rejects invalid governor ids", () => {
      expect(parseGovernorId("")).toBeNull();
      expect(parseGovernorId("eip155:1:0x1234")).toBeNull();
      expect(parseGovernorId(`eip155:42161:not-an-address`)).toBeNull();
    });
  });

  describe("buildProposalPath", () => {
    const proposalId =
      "112177996398925212273579485756315626637025938627124330171390356044681347897430";

    it("builds the canonical proposal page path", () => {
      expect(
        buildProposalPath({
          proposalId,
          governorAddress,
        })
      ).toBe(`/proposal/${proposalId}?govId=${governorId}`);
    });

    it("adds a tab query for non-default tabs", () => {
      expect(
        buildProposalPath({
          proposalId,
          governorAddress,
          tab: "stages",
        })
      ).toBe(`/proposal/${proposalId}?govId=${governorId}&tab=stages`);
    });

    it("omits the description tab from the URL", () => {
      expect(
        buildProposalPath({
          proposalId,
          governorAddress,
          tab: "description",
        })
      ).toBe(`/proposal/${proposalId}?govId=${governorId}`);
    });
  });
});
