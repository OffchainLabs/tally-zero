/**
 * Function signature lookup utilities
 * Provides local registry lookup and 4byte.directory API integration with caching
 */

import localSignatures from "@data/function-signatures.json";

import { STORAGE_PREFIX } from "@/config/storage-keys";
import { MS_PER_DAY } from "@/lib/date-utils";
import { debug } from "@/lib/debug";
import { getStoredValue, setStoredValue } from "@/lib/storage-utils";

/** 4byte.directory API endpoint */
const FOURBYTE_API = "https://www.4byte.directory/api/v1/signatures/";

/** LocalStorage key prefix for signature cache */
const CACHE_KEY_PREFIX = `${STORAGE_PREFIX}-4byte-`;

/** Cache TTL for signature lookups (24 hours) */
const CACHE_TTL_MS = MS_PER_DAY;

/** Timeout for 4byte.directory API requests in milliseconds */
const API_TIMEOUT_MS = 5000;

/** In-memory session cache for signature lookups */
const sessionCache = new Map<
  string,
  { signature: string | null; timestamp: number }
>();

/**
 * Look up function signature in local registry
 * @param selector - The 4-byte function selector (e.g., "0x12345678")
 * @returns The function signature if found, null otherwise
 */
export function lookupLocalSignature(selector: string): string | null {
  const normalizedSelector = selector.toLowerCase();
  const signatures = localSignatures.signatures as Record<string, string>;
  return signatures[normalizedSelector] || null;
}

/**
 * Query 4byte.directory API with caching
 * Uses both session cache and localStorage for efficient lookups
 * @param selector - The 4-byte function selector (e.g., "0x12345678")
 * @returns The function signature if found, null otherwise
 */
export async function lookup4byteDirectory(
  selector: string
): Promise<string | null> {
  const normalizedSelector = selector.toLowerCase();

  // Check session cache
  const cached = sessionCache.get(normalizedSelector);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.signature;
  }

  // Check localStorage cache
  const stored = getStoredValue<{
    signature: string | null;
    timestamp: number;
  } | null>(CACHE_KEY_PREFIX + normalizedSelector, null);
  if (stored && Date.now() - stored.timestamp < CACHE_TTL_MS) {
    sessionCache.set(normalizedSelector, stored);
    return stored.signature;
  }

  // Fetch from API
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

    const response = await fetch(
      `${FOURBYTE_API}?hex_signature=${normalizedSelector}`,
      { signal: controller.signal }
    );

    clearTimeout(timeoutId);

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as {
      results?: { text_signature: string }[];
    };

    const signature = data.results?.[0]?.text_signature ?? null;

    // Cache the result
    const cacheEntry = { signature, timestamp: Date.now() };
    sessionCache.set(normalizedSelector, cacheEntry);
    setStoredValue(CACHE_KEY_PREFIX + normalizedSelector, cacheEntry);

    return signature;
  } catch (error) {
    debug.calldata("4byte.directory lookup failed: %O", error);
    return null;
  }
}
