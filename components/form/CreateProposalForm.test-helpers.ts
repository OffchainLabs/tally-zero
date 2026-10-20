import { vi } from "vitest";

/**
 * Shared by the jsdom-backed CreateProposalForm tests (autosave, submission):
 * a working localStorage and the stored-draft fixture both files render.
 */

// Node ships its own experimental `localStorage` global, which stays undefined
// without `--localstorage-file` and shadows jsdom's. An in-memory Storage is
// all the form needs.
function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key) => map.get(key) ?? null,
    key: (index) => [...map.keys()][index] ?? null,
    removeItem: (key) => {
      map.delete(key);
    },
    setItem: (key, value) => {
      map.set(key, String(value));
    },
  };
}

export function installStorage() {
  const storage = memoryStorage();
  vi.stubGlobal("localStorage", storage);
  if (window !== globalThis) {
    Object.defineProperty(window, "localStorage", {
      value: storage,
      configurable: true,
    });
  }
}

export const ACCOUNT = "0x1234567890abcdef1234567890abcdef12345678";
export const STORED_TARGET = "0x2222222222222222222222222222222222222222";

// A draft stored on the server on New Year's Day; every local copy in these
// tests is dated relative to it.
export const SERVER_UPDATED_AT = "2026-01-01T00:00:00Z";

export const stored = {
  title: "Stored draft",
  description: "# Stored\n\nbody",
  governorType: "core" as const,
  actions: [
    { id: "restored-0", target: STORED_TARGET, value: "5", calldata: "0x" },
  ],
  updatedAt: SERVER_UPDATED_AT,
};
