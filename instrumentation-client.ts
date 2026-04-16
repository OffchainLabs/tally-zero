import posthog from "posthog-js";

import { env } from "./env";

if (env.NEXT_PUBLIC_POSTHOG_TOKEN) {
  posthog.init(env.NEXT_PUBLIC_POSTHOG_TOKEN, {
    api_host: env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
    capture_pageview: true,
    // store data in temporary memory that expires with each session
    persistence: "memory",
  });
}
