"use client";

import { PostHogProvider as PostHogReactProvider } from "posthog-js/react";

import { env } from "@/env";

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
        capture_pageview: true,
        persistence: "memory",
      }}
    >
      {children}
    </PostHogReactProvider>
  );
}
