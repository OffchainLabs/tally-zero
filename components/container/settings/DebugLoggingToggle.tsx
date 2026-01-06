"use client";

import { useDebugLogging } from "@/hooks/use-debug-logging";

import { SettingsToggle } from "./SettingsToggle";

/**
 * Toggle for enabling debug console logging (nerd mode feature)
 */
export function DebugLoggingToggle() {
  const { enabled, toggle } = useDebugLogging();

  return (
    <SettingsToggle
      label="Debug Logging"
      description="Enable verbose console logging for debugging lifecycle tracking"
      enabled={enabled}
      onToggle={toggle}
    />
  );
}
