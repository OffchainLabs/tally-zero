"use client";

import { PostHogProvider as PostHogReactProvider } from "posthog-js/react";

import { env } from "@/env";
import {
  MASKED_QUERY_PARAMS,
  PRIVATE_PROPERTY_KEYS,
  stripPrivateProperties,
} from "@/lib/posthog-privacy";

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  const token = env.NEXT_PUBLIC_POSTHOG_TOKEN;

  if (!token) {
    return <>{children}</>;
  }

  return (
    <PostHogReactProvider
      apiKey={token}
      options={{
        api_host: env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",

        // Identity: never write cookies, localStorage, or sessionStorage.
        cookieless_mode: "always",
        persistence: "memory",

        loaded: (posthog) => {
          // Super property on every event: ingestion skips GeoIP enrichment.
          // `stripPrivateProperties` sets it too; this covers anything that
          // bypasses before_send.
          posthog.register({ $geoip_disable: true });
        },

        // Strip device/browser/viewport/timezone/GeoIP properties client-side.
        property_denylist: [...PRIVATE_PROPERTY_KEYS],
        before_send: stripPrivateProperties,
        disableDeviceModel: true,

        // Mask secret-bearing / account-bound query params out of captured
        // URLs (`$current_url`, `$initial_current_url`, session entry URL),
        // alongside PostHog's default ad click-id list.
        mask_personal_data_properties: true,
        custom_personal_data_properties: [...MASKED_QUERY_PARAMS],

        // Capture only pageviews and explicit events. Everything that inspects
        // the DOM, the device, or performance stays off. `history_change`
        // fires on the initial load and on App Router path changes; plain
        // `true` would record the first load only.
        capture_pageview: "history_change",
        capture_pageleave: false,
        autocapture: false,
        capture_performance: false,
        capture_heatmaps: false,
        capture_dead_clicks: false,
        capture_exceptions: false,
        disable_scroll_properties: true,
        disable_session_recording: true,
        disable_surveys: true,
        disable_web_experiments: true,
        disable_product_tours: true,
        disable_conversations: true,

        // No feature flag / remote config request (it carries person data and
        // can re-enable the features above), and no third-party script loads.
        advanced_disable_flags: true,
        disable_external_dependency_loading: true,
      }}
    >
      {children}
    </PostHogReactProvider>
  );
}
