/**
 * Tests for tenderly settings utilities
 */

import {
  DEFAULT_TENDERLY_ORG,
  DEFAULT_TENDERLY_PROJECT,
  STORAGE_KEYS,
} from "@config/storage-keys";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getSimulationLink,
  getTenderlySettings,
  isTenderlyConfigured,
} from "./settings";

// Mock localStorage following the pattern from storage-utils.test.ts
const mockStorage: Record<string, string> = {};
const mockLocalStorage = {
  getItem: vi.fn((key: string) => mockStorage[key] ?? null),
  setItem: vi.fn((key: string, value: string) => {
    mockStorage[key] = value;
  }),
  removeItem: vi.fn((key: string) => {
    delete mockStorage[key];
  }),
};

describe("getTenderlySettings", () => {
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

  it("returns default values when localStorage is empty", () => {
    const settings = getTenderlySettings();
    expect(settings.org).toBe(DEFAULT_TENDERLY_ORG);
    expect(settings.project).toBe(DEFAULT_TENDERLY_PROJECT);
    expect(settings.accessToken).toBeNull();
  });

  it("returns custom org from localStorage", () => {
    mockStorage[STORAGE_KEYS.TENDERLY_ORG] = JSON.stringify("custom-org");
    const settings = getTenderlySettings();
    expect(settings.org).toBe("custom-org");
  });

  it("returns custom project from localStorage", () => {
    mockStorage[STORAGE_KEYS.TENDERLY_PROJECT] =
      JSON.stringify("custom-project");
    const settings = getTenderlySettings();
    expect(settings.project).toBe("custom-project");
  });

  it("returns access token from localStorage", () => {
    mockStorage[STORAGE_KEYS.TENDERLY_ACCESS_TOKEN] =
      JSON.stringify("my-secret-token");
    const settings = getTenderlySettings();
    expect(settings.accessToken).toBe("my-secret-token");
  });

  it("returns null for empty access token", () => {
    mockStorage[STORAGE_KEYS.TENDERLY_ACCESS_TOKEN] = JSON.stringify("");
    const settings = getTenderlySettings();
    expect(settings.accessToken).toBeNull();
  });
});

describe("isTenderlyConfigured", () => {
  beforeEach(() => {
    Object.keys(mockStorage).forEach((key) => delete mockStorage[key]);
    vi.stubGlobal("window", { localStorage: mockLocalStorage });
    vi.stubGlobal("localStorage", mockLocalStorage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns false with default settings", () => {
    expect(isTenderlyConfigured()).toBe(false);
  });

  it("returns false with only custom org", () => {
    mockStorage[STORAGE_KEYS.TENDERLY_ORG] = JSON.stringify("custom-org");
    expect(isTenderlyConfigured()).toBe(false);
  });

  it("returns false with only custom project", () => {
    mockStorage[STORAGE_KEYS.TENDERLY_PROJECT] =
      JSON.stringify("custom-project");
    expect(isTenderlyConfigured()).toBe(false);
  });

  it("returns false with custom org and project but no token", () => {
    mockStorage[STORAGE_KEYS.TENDERLY_ORG] = JSON.stringify("custom-org");
    mockStorage[STORAGE_KEYS.TENDERLY_PROJECT] =
      JSON.stringify("custom-project");
    expect(isTenderlyConfigured()).toBe(false);
  });

  it("returns false with token but default org", () => {
    mockStorage[STORAGE_KEYS.TENDERLY_ORG] =
      JSON.stringify(DEFAULT_TENDERLY_ORG);
    mockStorage[STORAGE_KEYS.TENDERLY_PROJECT] =
      JSON.stringify("custom-project");
    mockStorage[STORAGE_KEYS.TENDERLY_ACCESS_TOKEN] = JSON.stringify("token");
    expect(isTenderlyConfigured()).toBe(false);
  });

  it("returns true with custom org, project, and token", () => {
    mockStorage[STORAGE_KEYS.TENDERLY_ORG] = JSON.stringify("custom-org");
    mockStorage[STORAGE_KEYS.TENDERLY_PROJECT] =
      JSON.stringify("custom-project");
    mockStorage[STORAGE_KEYS.TENDERLY_ACCESS_TOKEN] =
      JSON.stringify("my-token");
    expect(isTenderlyConfigured()).toBe(true);
  });
});

describe("getSimulationLink", () => {
  beforeEach(() => {
    Object.keys(mockStorage).forEach((key) => delete mockStorage[key]);
    vi.stubGlobal("window", { localStorage: mockLocalStorage });
    vi.stubGlobal("localStorage", mockLocalStorage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns correct link with default settings", () => {
    const link = getSimulationLink("abc123");
    expect(link).toBe(
      `https://dashboard.tenderly.co/public/${DEFAULT_TENDERLY_ORG}/${DEFAULT_TENDERLY_PROJECT}/simulator/abc123`
    );
  });

  it("returns correct link with custom org and project", () => {
    mockStorage[STORAGE_KEYS.TENDERLY_ORG] = JSON.stringify("my-org");
    mockStorage[STORAGE_KEYS.TENDERLY_PROJECT] = JSON.stringify("my-project");
    const link = getSimulationLink("sim-456");
    expect(link).toBe(
      "https://dashboard.tenderly.co/public/my-org/my-project/simulator/sim-456"
    );
  });

  it("handles simulation IDs with special characters", () => {
    const link = getSimulationLink("abc-123_def");
    expect(link).toContain("abc-123_def");
  });
});
