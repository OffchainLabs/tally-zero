import "server-only";

import { unstable_cache } from "next/cache";

import { debug } from "@/lib/debug";

import {
  COUNCIL_ACTIONS_FEED_URL,
  parseCouncilActionsResponse,
} from "./helpers";
import type { CouncilAction } from "./types";

const MAX_BYTES = 512 * 1024;
const FETCH_TIMEOUT_MS = 8_000;

/** One hour: council actions are infrequent, but must not need a redeploy. */
const REVALIDATE_SECONDS = 3600;

class CouncilActionsError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "CouncilActionsError";
  }
}

async function fetchCouncilActions(): Promise<CouncilAction[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(COUNCIL_ACTIONS_FEED_URL, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      throw new CouncilActionsError(
        `Forum returned ${response.status} for ${COUNCIL_ACTIONS_FEED_URL}.`
      );
    }

    const declared = Number(response.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > MAX_BYTES) {
      throw new CouncilActionsError("Forum response too large.");
    }

    const text = await response.text();
    if (text.length > MAX_BYTES) {
      throw new CouncilActionsError("Forum response too large.");
    }

    return parseCouncilActionsResponse(JSON.parse(text));
  } catch (err) {
    debug.app("Failed to fetch Security Council actions: %O", err);
    if (err instanceof CouncilActionsError) throw err;
    const detail = err instanceof Error ? err.message : String(err);
    throw new CouncilActionsError(
      `Failed to load Security Council actions: ${detail}`,
      { cause: err }
    );
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Cached council actions, newest first. Rejects on upstream failure rather than
 * returning an empty list, so a transient forum outage is not cached as "no
 * actions" and callers can render a fallback instead.
 */
export const getCachedCouncilActions = unstable_cache(
  fetchCouncilActions,
  ["tally-zero-council-actions-v1"],
  { revalidate: REVALIDATE_SECONDS }
);
