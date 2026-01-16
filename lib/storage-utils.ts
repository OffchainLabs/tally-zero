import { DEFAULT_CACHE_TTL_MS, STORAGE_KEYS } from "@/config/storage-keys";

import { debug } from "./debug";

/**
 * Runtime check for browser environment
 * Can't use isBrowser constant due to test mocking requirements
 * @returns True if running in browser with localStorage available
 */
const inBrowser = () =>
  typeof window !== "undefined" && typeof localStorage !== "undefined";

/**
 * Get a value from localStorage with optional custom deserialization
 * @param key - The localStorage key to retrieve
 * @param defaultValue - Default value if key doesn't exist or parsing fails
 * @param deserialize - Optional custom deserializer function
 * @returns The stored value or default value
 */
export function getStoredValue<T>(
  key: string,
  defaultValue: T,
  deserialize?: (value: string) => T
): T {
  if (!inBrowser()) return defaultValue;

  try {
    const stored = localStorage.getItem(key);
    if (stored === null) return defaultValue;

    return deserialize ? deserialize(stored) : JSON.parse(stored);
  } catch (err) {
    debug.storage("failed to parse stored value for %s: %O", key, err);
    return defaultValue;
  }
}

/**
 * Get a string value stored via useLocalStorage hook (which uses JSON.stringify)
 * Handles values that were stringified before storage
 * @param key - The localStorage key to retrieve
 * @param defaultValue - Default value if key doesn't exist or parsing fails
 * @returns The stored string or default value
 */
export function getStoredJsonString(key: string, defaultValue: string): string {
  if (!inBrowser()) return defaultValue;

  try {
    const stored = localStorage.getItem(key);
    if (!stored) return defaultValue;

    const parsed = JSON.parse(stored);
    return parsed || defaultValue;
  } catch (err) {
    debug.storage("failed to parse JSON string for %s: %O", key, err);
    return defaultValue;
  }
}

/**
 * Get a numeric value from localStorage with JSON parsing
 * @param key - The localStorage key to retrieve
 * @param defaultValue - Default value if key doesn't exist, parsing fails, or value is NaN
 * @returns The stored number or default value
 */
export function getStoredNumber(key: string, defaultValue: number): number {
  if (!inBrowser()) return defaultValue;

  try {
    const stored = localStorage.getItem(key);
    if (!stored) return defaultValue;

    const parsed = JSON.parse(stored);
    return typeof parsed === "number" && !isNaN(parsed) ? parsed : defaultValue;
  } catch (err) {
    debug.storage("failed to parse number for %s: %O", key, err);
    return defaultValue;
  }
}

/**
 * Store a value in localStorage with optional custom serialization
 * @param key - The localStorage key to store under
 * @param value - The value to store
 * @param serialize - Optional custom serializer function (defaults to JSON.stringify)
 */
export function setStoredValue<T>(
  key: string,
  value: T,
  serialize?: (value: T) => string
): void {
  if (!inBrowser()) return;

  try {
    const serialized = serialize ? serialize(value) : JSON.stringify(value);
    localStorage.setItem(key, serialized);
  } catch (err) {
    debug.storage("failed to store value for %s: %O", key, err);
  }
}

/**
 * Get cache TTL in milliseconds from localStorage.
 * Stored value is in seconds, this converts to ms.
 */
export function getStoredCacheTtlMs(): number {
  const seconds = getStoredNumber(
    STORAGE_KEYS.CACHE_TTL,
    DEFAULT_CACHE_TTL_MS / 1000
  );
  return seconds > 0 ? seconds * 1000 : DEFAULT_CACHE_TTL_MS;
}
