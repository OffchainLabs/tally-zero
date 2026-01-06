import { describe, expect, it, vi } from "vitest";

import { delay } from "./delay-utils";

describe("delay-utils", () => {
  describe("delay", () => {
    it("returns a promise", () => {
      const result = delay(0);
      expect(result).toBeInstanceOf(Promise);
    });

    it("resolves after the specified time", async () => {
      vi.useFakeTimers();

      let resolved = false;
      const promise = delay(100).then(() => {
        resolved = true;
      });

      expect(resolved).toBe(false);

      vi.advanceTimersByTime(50);
      await Promise.resolve(); // Flush microtasks
      expect(resolved).toBe(false);

      vi.advanceTimersByTime(50);
      await promise;
      expect(resolved).toBe(true);

      vi.useRealTimers();
    });

    it("resolves with undefined", async () => {
      const result = await delay(0);
      expect(result).toBeUndefined();
    });

    it("handles zero milliseconds", async () => {
      const start = Date.now();
      await delay(0);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(50); // Should resolve almost immediately
    });
  });
});
