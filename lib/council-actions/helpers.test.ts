import { describe, expect, it } from "vitest";

import {
  buildTopicUrl,
  classifyCouncilAction,
  COUNCIL_ACTIONS_FEED_URL,
  COUNCIL_ACTIONS_TAG_URL,
  formatCouncilActionDate,
  parseCouncilActionsResponse,
} from "./helpers";

function topic(overrides: Record<string, unknown> = {}) {
  return {
    id: 31094,
    title: "Non-Emergency Security Action to Correct Total DVP",
    slug: "non-emergency-security-action-to-correct-total-dvp",
    created_at: "2026-07-24T03:32:42.430Z",
    ...overrides,
  };
}

function feed(topics: unknown[]) {
  return { topic_list: { topics } };
}

describe("council actions helpers", () => {
  describe("classifyCouncilAction", () => {
    it("classifies hyphenated non-emergency titles", () => {
      expect(
        classifyCouncilAction("Non-Emergency Security Action to Correct Total DVP")
      ).toBe("non-emergency");
    });

    it("classifies space-separated non emergency titles", () => {
      expect(
        classifyCouncilAction(
          "Non emergency actions to facilitate key rotation of Security Council - June 2024"
        )
      ).toBe("non-emergency");
    });

    it("classifies emergency titles", () => {
      expect(
        classifyCouncilAction("Security Council Emergency Action – 24/05/2026")
      ).toBe("emergency");
      expect(
        classifyCouncilAction(
          "Arbitrum Security Council Emergency Action - ArbOS 32"
        )
      ).toBe("emergency");
    });

    it("prefers non-emergency when both words appear", () => {
      expect(
        classifyCouncilAction(
          "Non-emergency Security Council action - update Arbitrum Nova DAC keyset"
        )
      ).toBe("non-emergency");
    });

    it("returns null when the title says neither", () => {
      expect(classifyCouncilAction("Key Rotation - July 2026")).toBeNull();
      expect(
        classifyCouncilAction('Fix Fee Oversight ArbOS v20 "Atlas"')
      ).toBeNull();
    });
  });

  describe("buildTopicUrl", () => {
    it("builds a discourse permalink", () => {
      expect(buildTopicUrl("key-rotation-july-2026", 31081)).toBe(
        "https://forum.arbitrum.foundation/t/key-rotation-july-2026/31081"
      );
    });
  });

  describe("feed URLs", () => {
    it("points at the council-actions tag", () => {
      expect(COUNCIL_ACTIONS_FEED_URL).toBe(
        "https://forum.arbitrum.foundation/tag/council-actions.json"
      );
      expect(COUNCIL_ACTIONS_TAG_URL).toBe(
        "https://forum.arbitrum.foundation/tag/council-actions"
      );
    });
  });

  describe("parseCouncilActionsResponse", () => {
    it("maps topics to actions", () => {
      const [action] = parseCouncilActionsResponse(feed([topic()]));

      expect(action).toEqual({
        id: 31094,
        title: "Non-Emergency Security Action to Correct Total DVP",
        url: "https://forum.arbitrum.foundation/t/non-emergency-security-action-to-correct-total-dvp/31094",
        createdAt: "2026-07-24T03:32:42.430Z",
        kind: "non-emergency",
      });
    });

    it("sorts newest first", () => {
      const actions = parseCouncilActionsResponse(
        feed([
          topic({ id: 1, created_at: "2024-03-05T03:14:11.544Z" }),
          topic({ id: 2, created_at: "2026-07-24T03:32:42.430Z" }),
          topic({ id: 3, created_at: "2025-10-13T22:43:51.318Z" }),
        ])
      );

      expect(actions.map((action) => action.id)).toEqual([2, 3, 1]);
    });

    it("trims titles and classifies from the trimmed value", () => {
      const [action] = parseCouncilActionsResponse(
        feed([topic({ title: "  Emergency Action  " })])
      );

      expect(action.title).toBe("Emergency Action");
      expect(action.kind).toBe("emergency");
    });

    it("skips malformed topics instead of failing the list", () => {
      const actions = parseCouncilActionsResponse(
        feed([
          topic({ id: "31094" }),
          topic({ id: 2, title: "   " }),
          topic({ id: 3, slug: "" }),
          topic({ id: 4, created_at: "not-a-date" }),
          topic({ id: 5, created_at: undefined }),
          null,
          "nonsense",
          topic({ id: 6 }),
        ])
      );

      expect(actions.map((action) => action.id)).toEqual([6]);
    });

    it("returns an empty list for unexpected payload shapes", () => {
      expect(parseCouncilActionsResponse(null)).toEqual([]);
      expect(parseCouncilActionsResponse(undefined)).toEqual([]);
      expect(parseCouncilActionsResponse({})).toEqual([]);
      expect(parseCouncilActionsResponse({ topic_list: {} })).toEqual([]);
      expect(
        parseCouncilActionsResponse({ topic_list: { topics: "nope" } })
      ).toEqual([]);
    });
  });

  describe("formatCouncilActionDate", () => {
    it("formats in UTC regardless of local timezone", () => {
      expect(formatCouncilActionDate("2026-07-24T03:32:42.430Z")).toBe(
        "Jul 24, 2026"
      );
    });

    it("does not roll the date backwards for early-UTC timestamps", () => {
      expect(formatCouncilActionDate("2024-03-05T03:14:11.544Z")).toBe(
        "Mar 5, 2024"
      );
    });

    it("returns an empty string for unparseable input", () => {
      expect(formatCouncilActionDate("not-a-date")).toBe("");
    });
  });
});
