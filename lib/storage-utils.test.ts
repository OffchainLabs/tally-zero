import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_CACHE_TTL_MS, STORAGE_KEYS } from "@/config/storage-keys";

import {
  getStoredCacheTtlMs,
  getStoredJsonString,
  getStoredNumber,
  getStoredValue,
  setStoredValue,
} from "./storage-utils";

describe("storage-utils", () => {
  // Mock localStorage
  const mockStorage: Record<string, string> = {};
  const mockLocalStorage = {
    getItem: vi.fn((key: string) => mockStorage[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      mockStorage[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete mockStorage[key];
    }),
    get length() {
      return Object.keys(mockStorage).length;
    },
    key: vi.fn((index: number) => Object.keys(mockStorage)[index] ?? null),
  };

  beforeEach(() => {
    // Clear mock storage
    Object.keys(mockStorage).forEach((key) => delete mockStorage[key]);

    // Mock window with localStorage
    vi.stubGlobal("window", { localStorage: mockLocalStorage });
    vi.stubGlobal("localStorage", mockLocalStorage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("getStoredValue", () => {
    it("returns default value when key does not exist", () => {
      expect(getStoredValue("nonexistent", "default")).toBe("default");
    });

    it("returns parsed JSON value when key exists", () => {
      mockStorage["test-key"] = JSON.stringify({ foo: "bar" });
      expect(getStoredValue("test-key", {})).toEqual({ foo: "bar" });
    });

    it("uses custom deserializer when provided", () => {
      mockStorage["test-key"] = "42";
      const result = getStoredValue("test-key", 0, (v) => parseInt(v, 10));
      expect(result).toBe(42);
    });

    it("returns default value on parse error", () => {
      mockStorage["test-key"] = "invalid json {";
      expect(getStoredValue("test-key", "default")).toBe("default");
    });
  });

  describe("getStoredJsonString", () => {
    it("returns default value when key does not exist", () => {
      expect(getStoredJsonString("nonexistent", "default")).toBe("default");
    });

    it("returns parsed JSON string value", () => {
      mockStorage["test-key"] = JSON.stringify("json string");
      expect(getStoredJsonString("test-key", "default")).toBe("json string");
    });

    it("returns default value for invalid JSON", () => {
      mockStorage["test-key"] = "invalid json {";
      expect(getStoredJsonString("test-key", "default")).toBe("default");
    });

    it("returns default value for empty parsed value", () => {
      mockStorage["test-key"] = JSON.stringify("");
      expect(getStoredJsonString("test-key", "default")).toBe("default");
    });
  });

  describe("getStoredNumber", () => {
    it("returns default value when key does not exist", () => {
      expect(getStoredNumber("nonexistent", 42)).toBe(42);
    });

    it("returns parsed number", () => {
      mockStorage["test-key"] = JSON.stringify(123);
      expect(getStoredNumber("test-key", 0)).toBe(123);
    });

    it("returns default value for non-number", () => {
      mockStorage["test-key"] = JSON.stringify("not a number");
      expect(getStoredNumber("test-key", 42)).toBe(42);
    });

    it("returns default value for NaN", () => {
      mockStorage["test-key"] = JSON.stringify(NaN);
      expect(getStoredNumber("test-key", 42)).toBe(42);
    });

    it("returns default value for invalid JSON", () => {
      mockStorage["test-key"] = "invalid json";
      expect(getStoredNumber("test-key", 42)).toBe(42);
    });
  });

  describe("setStoredValue", () => {
    it("stores JSON serialized value", () => {
      setStoredValue("test-key", { foo: "bar" });
      expect(mockStorage["test-key"]).toBe('{"foo":"bar"}');
    });

    it("uses custom serializer when provided", () => {
      setStoredValue("test-key", 42, (v) => `custom:${v}`);
      expect(mockStorage["test-key"]).toBe("custom:42");
    });
  });

  describe("SSR safety (window undefined)", () => {
    beforeEach(() => {
      // Simulate SSR by making window undefined
      vi.stubGlobal("window", undefined);
    });

    it("getStoredValue returns default in SSR", () => {
      expect(getStoredValue("key", "default")).toBe("default");
    });

    it("getStoredJsonString returns default in SSR", () => {
      expect(getStoredJsonString("key", "default")).toBe("default");
    });

    it("getStoredNumber returns default in SSR", () => {
      expect(getStoredNumber("key", 42)).toBe(42);
    });

    it("setStoredValue does nothing in SSR", () => {
      setStoredValue("key", "value");
      // No error thrown
    });

    it("getStoredCacheTtlMs returns default in SSR", () => {
      expect(getStoredCacheTtlMs()).toBe(DEFAULT_CACHE_TTL_MS);
    });
  });

  describe("getStoredCacheTtlMs", () => {
    it("returns default when no value is stored", () => {
      expect(getStoredCacheTtlMs()).toBe(DEFAULT_CACHE_TTL_MS);
    });

    it("converts seconds to milliseconds", () => {
      mockStorage[STORAGE_KEYS.CACHE_TTL] = JSON.stringify(120);
      expect(getStoredCacheTtlMs()).toBe(120000);
    });

    it("returns default for zero value", () => {
      mockStorage[STORAGE_KEYS.CACHE_TTL] = JSON.stringify(0);
      expect(getStoredCacheTtlMs()).toBe(DEFAULT_CACHE_TTL_MS);
    });

    it("returns default for negative value", () => {
      mockStorage[STORAGE_KEYS.CACHE_TTL] = JSON.stringify(-100);
      expect(getStoredCacheTtlMs()).toBe(DEFAULT_CACHE_TTL_MS);
    });
  });
});
