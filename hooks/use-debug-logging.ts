"use client";

import { STORAGE_KEYS } from "@/config/storage-keys";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { useCallback, useMemo } from "react";

interface UseDebugLoggingResult {
  enabled: boolean;
  setEnabled: (value: boolean) => void;
  toggle: () => void;
}

/**
 * Hook to manage debug logging state
 *
 * Debug logging is only effective when nerd mode is also enabled.
 * Changes take effect after page refresh.
 */
export function useDebugLogging(): UseDebugLoggingResult {
  const [enabled, setEnabled] = useLocalStorage<boolean>(
    STORAGE_KEYS.DEBUG_LOGGING,
    false
  );

  const toggle = useCallback(() => {
    setEnabled(!enabled);
    // Inform user that refresh is needed
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  }, [enabled, setEnabled]);

  return useMemo(
    () => ({
      enabled,
      setEnabled,
      toggle,
    }),
    [enabled, setEnabled, toggle]
  );
}
