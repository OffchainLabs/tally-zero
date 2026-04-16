"use client";
import { usePostHog } from "posthog-js/react";

export function useTracking() {
  const posthog = usePostHog();

  return {
    trackEvent: (event: string, properties?: Record<string, any>) => {
      posthog?.capture(event, properties);
    },

    trackButtonClick: (
      buttonName: string,
      properties?: Record<string, any>
    ) => {
      posthog?.capture("button_clicked", {
        button_name: buttonName,
        ...properties,
      });
    },

    trackFormSubmit: (formName: string, properties?: Record<string, any>) => {
      posthog?.capture("form_submitted", {
        form_name: formName,
        ...properties,
      });
    },

    trackLinkClick: (url: string, text?: string) => {
      posthog?.capture("link_clicked", { url, text });
    },
  };
}
