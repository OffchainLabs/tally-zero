/**
 * Debug logging utilities for TallyZero
 *
 * Uses the industry-standard `debug` package with environment-aware defaults:
 * - Node.js: Enable via DEBUG=tally:* environment variable
 * - Browser: Enable via nerd mode + debug toggle in settings
 *
 * @example
 * ```ts
 * import { debug } from "@/lib/debug";
 *
 * debug.stageTracker("Tracking proposal %s", proposalId);
 * debug.rpc("Fetching block %d", blockNumber);
 * ```
 *
 * Enable specific namespaces:
 * - DEBUG=tally:* (all)
 * - DEBUG=tally:rpc,tally:cache (specific)
 * - DEBUG=tally:stage-tracker (single)
 */

import createDebug from "debug";

import { STORAGE_KEYS } from "@/config/storage-keys";

// ============================================================================
// Environment Detection
// ============================================================================

/**
 * Check if code is running in a browser environment
 * Use this instead of repeating `typeof window === "undefined"` checks
 */
export const isBrowser =
  typeof window !== "undefined" && typeof localStorage !== "undefined";

const IS_BROWSER = isBrowser;

// ============================================================================
// Browser Integration
// ============================================================================

/**
 * Check if debug logging is enabled in browser via nerd mode + debug toggle
 */
function isBrowserDebugEnabled(): boolean {
  if (!IS_BROWSER) return false;

  try {
    const nerdMode = localStorage.getItem(STORAGE_KEYS.NERD_MODE) === "true";
    const debugLogging =
      localStorage.getItem(STORAGE_KEYS.DEBUG_LOGGING) === "true";
    return nerdMode && debugLogging;
  } catch {
    return false;
  }
}

/**
 * Check if debug logging is currently enabled
 */
export function isDebugEnabled(): boolean {
  if (IS_BROWSER) {
    return isBrowserDebugEnabled();
  }
  // In Node.js, check if DEBUG env includes tally namespaces
  const debugEnv =
    // eslint-disable-next-line no-process-env
    typeof process !== "undefined" ? process.env?.DEBUG : undefined;
  return debugEnv?.includes("tally") ?? false;
}

// ============================================================================
// Logger Factory
// ============================================================================

type DebugLogger = ReturnType<typeof createDebug>;

/**
 * Create a wrapped debug logger that respects our browser settings
 * In Node.js, uses debug package directly (respects DEBUG env)
 * In browser, checks nerd mode + debug toggle before logging
 */
function createWrappedLogger(namespace: string): DebugLogger {
  const baseLogger = createDebug(namespace);

  if (!IS_BROWSER) {
    // In Node.js, use the debug package directly
    return baseLogger;
  }

  // In browser, wrap to check our settings on each call
  // Namespaces are enabled once at initialization, not per-call
  const wrappedLogger = (formatter: string, ...args: unknown[]) => {
    if (isBrowserDebugEnabled()) {
      baseLogger(formatter, ...args);
    }
  };

  // Copy over debug package properties for compatibility
  Object.assign(wrappedLogger, baseLogger);
  return wrappedLogger as DebugLogger;
}

// ============================================================================
// Pre-defined Loggers
// ============================================================================

/**
 * Namespaced debug loggers for common subsystems
 *
 * Enable via:
 * - Node.js: DEBUG=tally:* yarn cache:build
 * - Browser: Settings → Nerd Mode → Debug Logging
 *
 * Available namespaces:
 * - tally:stage-tracker - Proposal lifecycle stage tracking
 * - tally:rpc - RPC calls and provider operations
 * - tally:cache - General caching operations
 * - tally:proposals - Proposal cache loading and merging
 * - tally:delegates - Delegate cache operations
 * - tally:search - Governor search operations
 * - tally:storage - LocalStorage operations
 * - tally:lifecycle - Lifecycle utilities
 * - tally:calldata - Calldata decoding
 * - tally:app - General application logs
 */
export const debug = {
  stageTracker: createWrappedLogger("tally:stage-tracker"),
  rpc: createWrappedLogger("tally:rpc"),
  cache: createWrappedLogger("tally:cache"),
  proposals: createWrappedLogger("tally:proposals"),
  delegates: createWrappedLogger("tally:delegates"),
  search: createWrappedLogger("tally:search"),
  storage: createWrappedLogger("tally:storage"),
  lifecycle: createWrappedLogger("tally:lifecycle"),
  calldata: createWrappedLogger("tally:calldata"),
  app: createWrappedLogger("tally:app"),
  eas: createWrappedLogger("tally:eas"),
} as const;

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Enable debug logging (browser only)
 * Sets the localStorage flag - takes effect immediately
 */
export function enableDebugLogging(): void {
  if (!IS_BROWSER) return;

  try {
    localStorage.setItem(STORAGE_KEYS.DEBUG_LOGGING, "true");
    // Enable gov-tracker debugging
    createDebug.enable("gov-tracker:*,tally:*");
    console.log(
      "[TallyZero] Debug logging enabled. Namespaces:",
      Object.keys(debug).join(", "),
      "+ gov-tracker:*"
    );
  } catch {
    // Storage unavailable
  }
}

/**
 * Disable debug logging (browser only)
 */
export function disableDebugLogging(): void {
  if (!IS_BROWSER) return;

  try {
    localStorage.removeItem(STORAGE_KEYS.DEBUG_LOGGING);
    // Disable all debug namespaces
    createDebug.disable();
    console.log("[TallyZero] Debug logging disabled.");
  } catch {
    // Storage unavailable
  }
}

// ============================================================================
// Browser Console API & Initialization
// ============================================================================

if (IS_BROWSER) {
  // Initialize debug namespaces on page load if debug mode is already enabled
  if (isBrowserDebugEnabled()) {
    createDebug.enable("gov-tracker:*,tally:*");
  }

  Object.assign(window, {
    TallyZeroDebug: {
      enable: enableDebugLogging,
      disable: disableDebugLogging,
      isEnabled: isDebugEnabled,
      namespaces: Object.keys(debug),
    },
  });
}
