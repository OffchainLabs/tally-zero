import type { CaptureResult } from "posthog-js";
import { describe, expect, it } from "vitest";

import { siteConfig } from "@config/site";

import {
  isPrivateProperty,
  MASKED_QUERY_PARAMS,
  PRIVATE_PROPERTY_KEYS,
  stripInternalReferrerQuery,
  stripPrivateProperties,
} from "./posthog-privacy";

function event(properties: Record<string, unknown>): CaptureResult {
  return { uuid: "u", event: "button_clicked", properties };
}

describe("isPrivateProperty", () => {
  it("flags every listed key, its $initial_ variant, and $geoip_* keys", () => {
    for (const key of PRIVATE_PROPERTY_KEYS) {
      expect(isPrivateProperty(key)).toBe(true);
      expect(isPrivateProperty(`$initial_${key.slice(1)}`)).toBe(true);
    }
    expect(isPrivateProperty("$geoip_country_code")).toBe(true);
    expect(isPrivateProperty("$initial_geoip_city_name")).toBe(true);
  });

  it("flags unknown keys in a denied family so SDK upgrades cannot leak them", () => {
    for (const key of [
      "$screen_dpi",
      "$viewport_orientation",
      "$device_memory",
      "$os_build",
      "$browser_engine",
      "$timezone_name",
      "$initial_device_memory",
    ]) {
      expect(isPrivateProperty(key), key).toBe(true);
    }
  });

  it("keeps the cookieless hash inputs: PostHog drops the event without them", () => {
    expect(isPrivateProperty("$raw_user_agent")).toBe(false);
    expect(isPrivateProperty("$host")).toBe(false);
  });

  it("keeps product and navigation properties", () => {
    for (const key of [
      "button_name",
      "form_name",
      "url",
      "$current_url",
      "$pathname",
      "$host",
      "$referrer",
      "$referring_domain",
      "$lib",
      "$lib_version",
      "$session_id",
      "$initial_current_url",
      "$geoip_disable",
    ]) {
      expect(isPrivateProperty(key), key).toBe(false);
    }
  });
});

describe("MASKED_QUERY_PARAMS", () => {
  it("covers the params that can carry secrets or account-bound ids", () => {
    expect(MASKED_QUERY_PARAMS).toEqual(["rpc", "draft"]);
  });
});

describe("stripInternalReferrerQuery", () => {
  it("drops the query string from referrers on our own origin", () => {
    expect(
      stripInternalReferrerQuery(
        `${siteConfig.url}/proposals?rpc=https%3A%2F%2Frpc.example%2Fkey123&days=30`
      )
    ).toBe(`${siteConfig.url}/proposals`);
    expect(stripInternalReferrerQuery(`${siteConfig.url}/proposals`)).toBe(
      `${siteConfig.url}/proposals`
    );
  });

  it("leaves external referrers and non-strings alone", () => {
    expect(stripInternalReferrerQuery("https://forum.example/t/1?x=1")).toBe(
      "https://forum.example/t/1?x=1"
    );
    expect(stripInternalReferrerQuery("$direct")).toBe("$direct");
    expect(stripInternalReferrerQuery(undefined)).toBeUndefined();
    expect(stripInternalReferrerQuery(42)).toBe(42);
  });
});

describe("stripPrivateProperties", () => {
  it("passes null through so dropped events stay dropped", () => {
    expect(stripPrivateProperties(null)).toBeNull();
  });

  it("removes device, browser, viewport, timezone, and GeoIP properties", () => {
    const result = stripPrivateProperties(
      event({
        button_name: "vote",
        $current_url: "https://example.test/proposals",
        $browser: "Chrome",
        $browser_version: 130,
        $browser_type: "browser",
        $browser_language: "en-GB",
        $browser_language_prefix: "en",
        $os: "Mac OS X",
        $os_name: "Mac OS X",
        $os_version: "14.5",
        $raw_user_agent: "Mozilla/5.0 ...",
        $host: "alt.gov.arbitrum.foundation",
        $device_type: "Desktop",
        $device_model: "Pixel 7",
        $device_id: "abc",
        $screen_height: 1080,
        $screen_width: 1920,
        $viewport_height: 900,
        $viewport_width: 1400,
        $timezone: "Europe/Berlin",
        $timezone_offset: -120,
        $ip: "203.0.113.7",
        $geoip_country_code: "DE",
      })
    );

    expect(result?.properties).toEqual({
      button_name: "vote",
      $current_url: "https://example.test/proposals",
      $raw_user_agent: "Mozilla/5.0 ...",
      $host: "alt.gov.arbitrum.foundation",
      $geoip_disable: true,
    });
  });

  it("scrubs $set and $set_once buckets inside properties and at the top level", () => {
    const input: CaptureResult = {
      ...event({
        $set: { $browser: "Firefox", plan: "free" },
        $set_once: { $initial_os: "Linux", $initial_referrer: "$direct" },
      }),
      $set: { $device_type: "Mobile", role: "delegate" },
      $set_once: { $initial_geoip_country_name: "France", first: true },
    };

    const result = stripPrivateProperties(input);

    expect(result?.properties.$set).toEqual({ plan: "free" });
    expect(result?.properties.$set_once).toEqual({
      $initial_referrer: "$direct",
    });
    expect(result?.$set).toEqual({ role: "delegate" });
    expect(result?.$set_once).toEqual({ first: true });
  });

  it("strips internal referrer query strings everywhere posthog stores them", () => {
    const internal = `${siteConfig.url}/proposal/new?draft=abc123`;
    const result = stripPrivateProperties({
      ...event({
        $referrer: internal,
        $initial_person_info: { u: `${siteConfig.url}/`, r: internal },
        $set_once: { $initial_referrer: internal },
      }),
      $set_once: { $initial_referrer: internal },
    });

    const path = `${siteConfig.url}/proposal/new`;
    expect(result?.properties.$referrer).toBe(path);
    expect(result?.properties.$initial_person_info).toEqual({
      u: `${siteConfig.url}/`,
      r: path,
    });
    expect(result?.properties.$set_once.$initial_referrer).toBe(path);
    expect(result?.$set_once?.$initial_referrer).toBe(path);
  });

  it("always asks ingestion to skip GeoIP enrichment", () => {
    const result = stripPrivateProperties(event({}));
    expect(result?.properties.$geoip_disable).toBe(true);
  });

  it("tolerates malformed property buckets without throwing", () => {
    const malformed = {
      uuid: "u",
      event: "x",
      properties: undefined,
      $set: "not-an-object",
    } as unknown as CaptureResult;
    expect(() => stripPrivateProperties(malformed)).not.toThrow();
    expect(stripPrivateProperties(malformed)?.properties).toEqual({
      $geoip_disable: true,
    });
  });

  it("does not mutate the input event", () => {
    const input = event({
      $browser: "Safari",
      button_name: "x",
      $initial_person_info: { u: "https://x/", r: `${siteConfig.url}/a?rpc=1` },
    });
    const snapshot = JSON.parse(JSON.stringify(input));
    stripPrivateProperties(input);
    expect(input).toEqual(snapshot);
  });
});
