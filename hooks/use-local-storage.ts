/**
 * Hook for synced localStorage state with SSR support
 * Handles hydration, cross-tab synchronization, and type safety
 */

import { useCallback, useEffect, useState } from "react";

import { debug } from "@/lib/debug";

/**
 * Custom hook for persisting state to localStorage with SSR support
 * @param key - The localStorage key to use
 * @param initialValue - Default value before hydration
 * @returns Tuple of [value, setter, isHydrated]
 * @example
 * const [theme, setTheme, isReady] = useLocalStorage('theme', 'light');
 */
export function useLocalStorage<T>(
  key: string,
  initialValue: T
): [T, (value: T | ((prev: T) => T)) => void, boolean] {
  // Always start with initialValue to avoid hydration mismatch
  const [storedValue, setStoredValue] = useState<T>(initialValue);
  const [isHydrated, setIsHydrated] = useState(false);

  // Hydrate from localStorage after mount
  useEffect(() => {
    try {
      const item = window.localStorage.getItem(key);
      if (item !== null) {
        setStoredValue(JSON.parse(item) as T);
      }
    } catch (error) {
      debug.storage("failed to parse stored value for %s: %O", key, error);
    }
    setIsHydrated(true);
  }, [key]);

  const setValue = useCallback(
    (value: T | ((prev: T) => T)) => {
      setStoredValue((prev) => {
        const valueToStore = value instanceof Function ? value(prev) : value;
        try {
          window.localStorage.setItem(key, JSON.stringify(valueToStore));
        } catch (error) {
          debug.storage("failed to save %s: %O", key, error);
        }
        return valueToStore;
      });
    },
    [key]
  );

  // Listen for changes from other tabs (including deletions)
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === key) {
        if (e.newValue === null) {
          // Item was deleted in another tab - revert to initial value
          debug.storage("storage key %s deleted in another tab", key);
          setStoredValue(initialValue);
        } else {
          try {
            setStoredValue(JSON.parse(e.newValue) as T);
          } catch (error) {
            debug.storage(
              "failed to parse storage event for %s: %O",
              key,
              error
            );
          }
        }
      }
    };

    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, [key, initialValue]);

  return [storedValue, setValue, isHydrated];
}
