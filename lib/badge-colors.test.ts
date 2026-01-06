/**
 * Tests for badge-colors constants
 */

import { describe, expect, it } from "vitest";

import {
  QUORUM_COLORS,
  STATUS_BADGE_COLORS,
  STATUS_ICON_COLORS,
  STATUS_TEXT_COLORS,
  VOTE_COLORS,
} from "./badge-colors";

describe("badge-colors", () => {
  describe("VOTE_COLORS", () => {
    it("has for, against, and abstain vote types", () => {
      expect(VOTE_COLORS).toHaveProperty("for");
      expect(VOTE_COLORS).toHaveProperty("against");
      expect(VOTE_COLORS).toHaveProperty("abstain");
    });

    it("each vote type has text, bg, dot, and gradient properties", () => {
      const voteTypes = ["for", "against", "abstain"] as const;

      for (const type of voteTypes) {
        expect(VOTE_COLORS[type]).toHaveProperty("text");
        expect(VOTE_COLORS[type]).toHaveProperty("bg");
        expect(VOTE_COLORS[type]).toHaveProperty("dot");
        expect(VOTE_COLORS[type]).toHaveProperty("gradient");
      }
    });

    it("for uses emerald colors", () => {
      expect(VOTE_COLORS.for.text).toContain("emerald");
      expect(VOTE_COLORS.for.bg).toContain("emerald");
    });

    it("against uses rose colors", () => {
      expect(VOTE_COLORS.against.text).toContain("rose");
      expect(VOTE_COLORS.against.bg).toContain("rose");
    });

    it("abstain uses gray/muted colors", () => {
      expect(VOTE_COLORS.abstain.bg).toContain("gray");
    });
  });

  describe("QUORUM_COLORS", () => {
    it("has reached and pending states", () => {
      expect(QUORUM_COLORS).toHaveProperty("reached");
      expect(QUORUM_COLORS).toHaveProperty("pending");
    });

    it("each state has text, bg, ring, icon, and gradient properties", () => {
      const states = ["reached", "pending"] as const;

      for (const state of states) {
        expect(QUORUM_COLORS[state]).toHaveProperty("text");
        expect(QUORUM_COLORS[state]).toHaveProperty("bg");
        expect(QUORUM_COLORS[state]).toHaveProperty("ring");
        expect(QUORUM_COLORS[state]).toHaveProperty("icon");
        expect(QUORUM_COLORS[state]).toHaveProperty("gradient");
      }
    });

    it("reached uses emerald colors", () => {
      expect(QUORUM_COLORS.reached.text).toContain("emerald");
      expect(QUORUM_COLORS.reached.icon).toContain("emerald");
    });

    it("pending uses violet colors", () => {
      expect(QUORUM_COLORS.pending.text).toContain("violet");
      expect(QUORUM_COLORS.pending.icon).toContain("violet");
    });
  });

  describe("STATUS_BADGE_COLORS", () => {
    it("has all status types", () => {
      expect(STATUS_BADGE_COLORS).toHaveProperty("success");
      expect(STATUS_BADGE_COLORS).toHaveProperty("warning");
      expect(STATUS_BADGE_COLORS).toHaveProperty("error");
      expect(STATUS_BADGE_COLORS).toHaveProperty("info");
      expect(STATUS_BADGE_COLORS).toHaveProperty("muted");
    });

    it("success uses green colors", () => {
      expect(STATUS_BADGE_COLORS.success).toContain("green");
    });

    it("warning uses yellow colors", () => {
      expect(STATUS_BADGE_COLORS.warning).toContain("yellow");
    });

    it("error uses red colors", () => {
      expect(STATUS_BADGE_COLORS.error).toContain("red");
    });

    it("info uses blue colors", () => {
      expect(STATUS_BADGE_COLORS.info).toContain("blue");
    });

    it("muted uses muted colors", () => {
      expect(STATUS_BADGE_COLORS.muted).toContain("muted");
    });
  });

  describe("STATUS_TEXT_COLORS", () => {
    it("has matching status types as badge colors", () => {
      const badgeKeys = Object.keys(STATUS_BADGE_COLORS);
      const textKeys = Object.keys(STATUS_TEXT_COLORS);

      expect(textKeys).toEqual(badgeKeys);
    });

    it("all colors contain text- prefix", () => {
      for (const color of Object.values(STATUS_TEXT_COLORS)) {
        expect(color).toContain("text-");
      }
    });
  });

  describe("STATUS_ICON_COLORS", () => {
    it("has matching status types as badge colors", () => {
      const badgeKeys = Object.keys(STATUS_BADGE_COLORS);
      const iconKeys = Object.keys(STATUS_ICON_COLORS);

      expect(iconKeys).toEqual(badgeKeys);
    });

    it("all colors contain text- prefix", () => {
      for (const color of Object.values(STATUS_ICON_COLORS)) {
        expect(color).toContain("text-");
      }
    });
  });

  describe("dark mode support", () => {
    it("vote colors include dark mode variants", () => {
      expect(VOTE_COLORS.for.text).toContain("dark:");
      expect(VOTE_COLORS.against.text).toContain("dark:");
    });

    it("quorum colors include dark mode variants", () => {
      expect(QUORUM_COLORS.reached.text).toContain("dark:");
      expect(QUORUM_COLORS.pending.text).toContain("dark:");
    });

    it("status badge colors include dark mode variants", () => {
      expect(STATUS_BADGE_COLORS.success).toContain("dark:");
      expect(STATUS_BADGE_COLORS.warning).toContain("dark:");
      expect(STATUS_BADGE_COLORS.error).toContain("dark:");
      expect(STATUS_BADGE_COLORS.info).toContain("dark:");
    });
  });
});
