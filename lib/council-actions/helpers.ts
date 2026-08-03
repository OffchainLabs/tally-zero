/**
 * Pure helpers for turning the Discourse `council-actions` tag feed into
 * {@link CouncilAction} records. Kept free of `server-only` imports so the
 * parsing and classification rules stay unit-testable.
 */

import type { CouncilAction, CouncilActionKind } from "./types";

export const FORUM_HOST = "forum.arbitrum.foundation";

export const COUNCIL_ACTIONS_TAG = "council-actions";

/** The tag feed the actions list is built from. */
export const COUNCIL_ACTIONS_FEED_URL = `https://${FORUM_HOST}/tag/${COUNCIL_ACTIONS_TAG}.json`;

/** Human-facing forum page for the tag, used as a fallback link. */
export const COUNCIL_ACTIONS_TAG_URL = `https://${FORUM_HOST}/tag/${COUNCIL_ACTIONS_TAG}`;

// "Non-Emergency", "Non emergency" and "Non-emergency" all appear in the feed.
const NON_EMERGENCY_PATTERN = /\bnon[-\s]?emergency\b/i;
const EMERGENCY_PATTERN = /\bemergency\b/i;

/**
 * Derives the action kind from the topic title. The forum has no structured
 * field for this, but titles consistently say "Emergency" or "Non-emergency";
 * titles that say neither get no badge rather than a guess.
 */
export function classifyCouncilAction(title: string): CouncilActionKind {
  if (NON_EMERGENCY_PATTERN.test(title)) return "non-emergency";
  if (EMERGENCY_PATTERN.test(title)) return "emergency";
  return null;
}

/** Builds the canonical discourse permalink for a topic. */
export function buildTopicUrl(slug: string, id: number): string {
  return `https://${FORUM_HOST}/t/${slug}/${id}`;
}

interface RawTopic {
  id?: unknown;
  title?: unknown;
  slug?: unknown;
  created_at?: unknown;
}

function toCouncilAction(topic: RawTopic): CouncilAction | null {
  const { id, title, slug, created_at: createdAt } = topic;
  if (typeof id !== "number" || !Number.isFinite(id)) return null;
  if (typeof title !== "string" || !title.trim()) return null;
  if (typeof slug !== "string" || !slug.trim()) return null;
  if (typeof createdAt !== "string" || Number.isNaN(Date.parse(createdAt))) {
    return null;
  }

  const trimmedTitle = title.trim();
  return {
    id,
    title: trimmedTitle,
    url: buildTopicUrl(slug, id),
    createdAt,
    kind: classifyCouncilAction(trimmedTitle),
  };
}

/**
 * Parses a Discourse tag feed payload into actions sorted newest first.
 * Malformed topics are skipped rather than failing the whole list, so one bad
 * entry upstream cannot blank the page.
 */
export function parseCouncilActionsResponse(payload: unknown): CouncilAction[] {
  const topics = (payload as { topic_list?: { topics?: unknown } } | null)
    ?.topic_list?.topics;
  if (!Array.isArray(topics)) return [];

  return topics
    .map((topic) =>
      topic && typeof topic === "object"
        ? toCouncilAction(topic as RawTopic)
        : null
    )
    .filter((action): action is CouncilAction => action !== null)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

/**
 * Formats an action timestamp for display. Pinned to UTC so statically
 * generated output does not depend on the build machine's timezone.
 */
export function formatCouncilActionDate(createdAt: string): string {
  const parsed = Date.parse(createdAt);
  if (Number.isNaN(parsed)) return "";
  return new Date(parsed).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}
