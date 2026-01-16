import { STORAGE_KEYS, STORAGE_PREFIX } from "@/config/storage-keys";
import { SECONDS_PER_HOUR, SECONDS_PER_MINUTE } from "@/lib/date-utils";

// Get all TallyZero storage keys
export const ALL_STORAGE_KEYS = Object.values(STORAGE_KEYS).filter(
  (key) => !key.endsWith("-") // Exclude prefixes
);

/**
 * Check if a key is a cache key (stages or checkpoint)
 */
function isCacheKey(key: string): boolean {
  return (
    key.startsWith(STORAGE_KEYS.STAGES_CACHE_PREFIX) ||
    key.startsWith(STORAGE_KEYS.CHECKPOINT_CACHE_PREFIX)
  );
}

/**
 * Get cache stats from localStorage
 */
export function getCacheStats(): { count: number; size: string } {
  let count = 0;
  let size = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && isCacheKey(key)) {
      count++;
      const value = localStorage.getItem(key);
      if (value) size += value.length;
    }
  }
  return { count, size: (size / 1024).toFixed(2) };
}

/**
 * Get total storage usage for TallyZero keys
 */
export function getTotalStorageUsage(): string {
  let total = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(STORAGE_PREFIX)) {
      const value = localStorage.getItem(key);
      if (value) total += key.length + value.length;
    }
  }
  return (total / 1024).toFixed(2);
}

/**
 * Clear all cached proposal stages and checkpoints from localStorage
 */
export function clearCache(): number {
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && isCacheKey(key)) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach((key) => localStorage.removeItem(key));
  return keysToRemove.length;
}

/**
 * Clear all TallyZero settings (factory reset)
 */
export function clearAllSettings(): void {
  // Clear all TallyZero keys
  ALL_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));
  // Clear cache entries
  clearCache();
}

/**
 * Export all settings to a JSON object
 */
export function exportSettings(): Record<string, unknown> {
  const settings: Record<string, unknown> = {};
  ALL_STORAGE_KEYS.forEach((key) => {
    const value = localStorage.getItem(key);
    if (value !== null) {
      try {
        settings[key] = JSON.parse(value);
      } catch {
        settings[key] = value;
      }
    }
  });
  return settings;
}

/**
 * Import settings from a JSON object
 */
export function importSettings(settings: Record<string, unknown>): void {
  Object.entries(settings).forEach(([key, value]) => {
    if (ALL_STORAGE_KEYS.includes(key as (typeof ALL_STORAGE_KEYS)[number])) {
      localStorage.setItem(key, JSON.stringify(value));
    }
  });
}

/**
 * Format TTL value to human-readable string
 */
export function formatTtl(ttlSeconds: number): string {
  if (ttlSeconds >= SECONDS_PER_HOUR) {
    const hours = Math.floor(ttlSeconds / SECONDS_PER_HOUR);
    const minutes = Math.floor(
      (ttlSeconds % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE
    );
    return `${hours}h ${minutes}m`;
  }
  if (ttlSeconds >= SECONDS_PER_MINUTE) {
    const minutes = Math.floor(ttlSeconds / SECONDS_PER_MINUTE);
    const seconds = ttlSeconds % SECONDS_PER_MINUTE;
    return `${minutes}m ${seconds}s`;
  }
  return `${ttlSeconds}s`;
}
