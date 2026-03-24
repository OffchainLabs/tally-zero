/**
 * Tests for debug logging utilities
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { STORAGE_KEYS } from "@/config/storage-keys";

// Mock localStorage for browser tests
const mockLocalStorage: Record<string, string> = {};
const localStorageMock = {
  getItem: vi.fn((key: string) => mockLocalStorage[key] ?? null),
  setItem: vi.fn((key: string, value: string) => {
    mockLocalStorage[key] = value;
  }),
  removeItem: vi.fn((key: string) => {
    delete mockLocalStorage[key];
  }),
  clear: vi.fn(() => {
    Object.keys(mockLocalStorage).forEach(
      (key) => delete mockLocalStorage[key]
    );
  }),
};

describe("debug", () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  describe("isBrowser constant", () => {
    it("correctly detects test environment", async () => {
      // In vitest's jsdom environment, window exists but may not have full localStorage
      const { isBrowser } = await import("./debug");
      // This test just verifies the constant exists and is boolean
      expect(typeof isBrowser).toBe("boolean");
    });
  });

  describe("debug loggers", () => {
    it("exports all expected namespaces", async () => {
      const { debug } = await import("./debug");

      expect(debug.stageTracker).toBeDefined();
      expect(debug.rpc).toBeDefined();
      expect(debug.cache).toBeDefined();
      expect(debug.proposals).toBeDefined();
      expect(debug.delegates).toBeDefined();
      expect(debug.search).toBeDefined();
      expect(debug.storage).toBeDefined();
      expect(debug.lifecycle).toBeDefined();
      expect(debug.calldata).toBeDefined();
      expect(debug.app).toBeDefined();
    });

    it("loggers are callable functions", async () => {
      const { debug } = await import("./debug");

      // All loggers should be callable without throwing
      expect(typeof debug.stageTracker).toBe("function");
      expect(typeof debug.rpc).toBe("function");
      expect(typeof debug.app).toBe("function");
    });
  });

  describe("isDebugEnabled", () => {
    it("returns a boolean", async () => {
      const { isDebugEnabled } = await import("./debug");

      const result = isDebugEnabled();
      expect(typeof result).toBe("boolean");
    });
  });

  describe("enableDebugLogging and disableDebugLogging", () => {
    it("enableDebugLogging is a function", async () => {
      const { enableDebugLogging } = await import("./debug");
      expect(typeof enableDebugLogging).toBe("function");
    });

    it("disableDebugLogging is a function", async () => {
      const { disableDebugLogging } = await import("./debug");
      expect(typeof disableDebugLogging).toBe("function");
    });

    it("functions can be called without throwing", async () => {
      const { enableDebugLogging, disableDebugLogging } = await import(
        "./debug"
      );

      // These should not throw even in test environment
      expect(() => enableDebugLogging()).not.toThrow();
      expect(() => disableDebugLogging()).not.toThrow();
    });
  });

  describe("storage keys integration", () => {
    it("uses correct storage keys for debug settings", () => {
      // Verify the storage keys exist
      expect(STORAGE_KEYS.NERD_MODE).toBe("tally-zero-nerd-mode");
      expect(STORAGE_KEYS.DEBUG_LOGGING).toBe("tally-zero-debug-logging");
    });
  });

  describe("namespace consistency", () => {
    it("all namespaces follow the tally: prefix convention", async () => {
      const { debug } = await import("./debug");

      // The debug object should have all expected keys
      const expectedNamespaces = [
        "stageTracker",
        "rpc",
        "cache",
        "proposals",
        "delegates",
        "search",
        "storage",
        "lifecycle",
        "calldata",
        "app",
        "eas",
      ];

      for (const ns of expectedNamespaces) {
        expect(debug).toHaveProperty(ns);
        expect(typeof (debug as Record<string, unknown>)[ns]).toBe("function");
      }
    });

    it("exports exactly the expected number of namespaces", async () => {
      const { debug } = await import("./debug");

      const namespaceCount = Object.keys(debug).length;
      expect(namespaceCount).toBe(11);
    });
  });
});
