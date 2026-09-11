import type { CaptureResult, Properties } from "posthog-js";

import { siteConfig } from "@config/site";

export const PRIVATE_PROPERTY_KEYS: readonly string[] = [
  // Browser and OS
  "$browser",
  "$browser_version",
  "$browser_type",
  "$browser_language",
  "$browser_language_prefix",
  "$os",
  "$os_name",
  "$os_version",
  // Device
  "$device",
  "$device_type",
  "$device_model",
  "$device_id",
  // Screen and viewport
  "$screen_height",
  "$screen_width",
  "$viewport_height",
  "$viewport_width",
  // Locale and location. Without `$timezone`, PostHog's cookieless hashing
  // uses the project timezone (then UTC) for its calendar-day boundary; the
  // event is not dropped.
  "$timezone",
  "$timezone_offset",
  // The browser SDK never sets `$ip`. The capture endpoint adds it
  // server-side, cookieless hashing consumes it, then ingestion deletes it.
  // Listed as defense in depth only.
  "$ip",
];

/**
 * Query parameters masked out of `$current_url`, `$initial_current_url`, and
 * the session entry URL via `mask_personal_data_properties`. `rpc` is a
 * user-supplied RPC endpoint that can embed a provider API key; `draft` is a
 * server draft id bound to a signed-in wallet.
 */
export const MASKED_QUERY_PARAMS: readonly string[] = ["rpc", "draft"];

const PRIVATE_KEY_SET = new Set(PRIVATE_PROPERTY_KEYS);
const PRIVATE_PREFIXES = [
  "$screen",
  "$viewport",
  "$device",
  "$os",
  "$browser",
  "$timezone",
  "$geoip_",
];
const INITIAL_PREFIX = "$initial_";
/** Ingestion flag that opts the event out of GeoIP enrichment; not data. */
const GEOIP_OPT_OUT = "$geoip_disable";

export function isPrivateProperty(key: string): boolean {
  const base = key.startsWith(INITIAL_PREFIX)
    ? `$${key.slice(INITIAL_PREFIX.length)}`
    : key;
  if (base === GEOIP_OPT_OUT) return false;
  return (
    PRIVATE_KEY_SET.has(base) ||
    PRIVATE_PREFIXES.some((prefix) => base.startsWith(prefix))
  );
}

/**
 * Referrers on our own origin come from internal navigation and can carry the
 * masked query params above, which `mask_personal_data_properties` does not
 * touch. Drop the query string; the path is all analytics needs.
 */
export function stripInternalReferrerQuery(referrer: unknown): unknown {
  if (typeof referrer !== "string" || !referrer.startsWith(siteConfig.url)) {
    return referrer;
  }
  const queryIndex = referrer.indexOf("?");
  return queryIndex === -1 ? referrer : referrer.slice(0, queryIndex);
}

function isRecord(value: unknown): value is Properties {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function scrub(properties: Properties): Properties {
  const clean: Properties = {};
  for (const [key, value] of Object.entries(properties)) {
    if (isPrivateProperty(key)) continue;
    clean[key] =
      key === "$referrer" || key === "$initial_referrer"
        ? stripInternalReferrerQuery(value)
        : value;
  }
  // `$initial_person_info` is `{ u: entry url, r: entry referrer }`.
  const initial = clean.$initial_person_info;
  if (isRecord(initial) && "r" in initial) {
    clean.$initial_person_info = {
      ...initial,
      r: stripInternalReferrerQuery(initial.r),
    };
  }
  return clean;
}

/**
 * `before_send` hook. Runs last in the capture pipeline, after
 * `property_denylist` and after `$set` / `$set_once` are assembled. Removes
 * private properties from the event and its person-property buckets, strips
 * internal referrer query strings, and tells ingestion not to run GeoIP
 * enrichment (`$geoip_disable`).
 *
 * Must never throw: posthog-js drops the event entirely if it does, which
 * would silently kill all analytics. Keep it to guards, object iteration, and
 * string slicing.
 */
export function stripPrivateProperties(
  event: CaptureResult | null
): CaptureResult | null {
  if (!event) return null;

  const properties = scrub(isRecord(event.properties) ? event.properties : {});
  for (const bucket of ["$set", "$set_once"] as const) {
    if (isRecord(properties[bucket])) {
      properties[bucket] = scrub(properties[bucket]);
    }
  }
  properties[GEOIP_OPT_OUT] = true;

  const result: CaptureResult = { ...event, properties };
  if (isRecord(event.$set)) result.$set = scrub(event.$set);
  if (isRecord(event.$set_once)) result.$set_once = scrub(event.$set_once);
  return result;
}
