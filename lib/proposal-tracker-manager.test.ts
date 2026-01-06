import { beforeEach, describe, expect, it, vi } from "vitest";

import { MS_PER_HOUR, MS_PER_MINUTE } from "./date-utils";
import { delay } from "./delay-utils";

// We need to create a fresh instance for each test, so we'll test the class directly
// by re-importing or creating instances
describe("proposal-tracker-manager", () => {
  // Reset module state before each test
  beforeEach(() => {
    vi.resetModules();
  });

  describe("getSessionKey", () => {
    it("creates consistent keys from address and proposalId", async () => {
      const { trackerManager } = await import("./proposal-tracker-manager");

      // Create two sessions with same params
      const session1 = trackerManager.createSession("123", "0xABC");
      const session2 = trackerManager.getSession("123", "0xABC");

      expect(session1).toBe(session2);
    });

    it("normalizes addresses to lowercase", async () => {
      const { trackerManager } = await import("./proposal-tracker-manager");

      const session1 = trackerManager.createSession(
        "123",
        "0xABCDEF1234567890"
      );
      const session2 = trackerManager.getSession("123", "0xabcdef1234567890");

      expect(session1).toBe(session2);
    });
  });

  describe("TrackingSession", () => {
    it("creates session with correct initial state", async () => {
      const { trackerManager } = await import("./proposal-tracker-manager");

      const session = trackerManager.createSession("proposal-1", "0x1234");

      expect(session.proposalId).toBe("proposal-1");
      expect(session.governorAddress).toBe("0x1234");
      expect(session.status).toBe("idle");
      expect(session.stages).toEqual([]);
      expect(session.currentStageIndex).toBe(-1);
      expect(session.result).toBeNull();
      expect(session.error).toBeNull();
      expect(session.refreshingFromIndex).toBeNull();
      expect(session.subscribers.size).toBe(0);
      expect(session.abortController).toBeNull();
      expect(session.queuePosition).toBeNull();
      expect(session.lastUpdatedAt).toBeGreaterThan(0);
      expect(session.isBackgroundRefreshing).toBe(false);
    });

    it("returns existing session if one exists", async () => {
      const { trackerManager } = await import("./proposal-tracker-manager");

      const session1 = trackerManager.createSession("proposal-1", "0x1234");
      session1.status = "loading";

      const session2 = trackerManager.createSession("proposal-1", "0x1234");

      expect(session2.status).toBe("loading");
      expect(session1).toBe(session2);
    });
  });

  describe("updateSession", () => {
    it("updates session fields", async () => {
      const { trackerManager } = await import("./proposal-tracker-manager");

      trackerManager.createSession("proposal-1", "0x1234");
      trackerManager.updateSession("proposal-1", "0x1234", {
        status: "loading",
        currentStageIndex: 2,
      });

      const session = trackerManager.getSession("proposal-1", "0x1234");
      expect(session?.status).toBe("loading");
      expect(session?.currentStageIndex).toBe(2);
    });

    it("updates lastUpdatedAt timestamp", async () => {
      const { trackerManager } = await import("./proposal-tracker-manager");

      const session = trackerManager.createSession("proposal-1", "0x1234");
      const originalTimestamp = session.lastUpdatedAt;

      // Wait a tiny bit to ensure timestamp difference
      await delay(5);

      trackerManager.updateSession("proposal-1", "0x1234", {
        status: "complete",
      });

      expect(session.lastUpdatedAt).toBeGreaterThan(originalTimestamp);
    });

    it("notifies subscribers on update", async () => {
      const { trackerManager } = await import("./proposal-tracker-manager");

      const callback = vi.fn();
      trackerManager.subscribe("proposal-1", "0x1234", callback);

      // Reset the mock since subscribe immediately calls callback
      callback.mockClear();

      trackerManager.updateSession("proposal-1", "0x1234", {
        status: "loading",
      });

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ status: "loading" })
      );
    });

    it("does nothing if session does not exist", async () => {
      const { trackerManager } = await import("./proposal-tracker-manager");

      // Should not throw
      trackerManager.updateSession("nonexistent", "0x1234", {
        status: "loading",
      });

      expect(
        trackerManager.getSession("nonexistent", "0x1234")
      ).toBeUndefined();
    });
  });

  describe("subscribe", () => {
    it("creates session if it does not exist", async () => {
      const { trackerManager } = await import("./proposal-tracker-manager");

      const callback = vi.fn();
      trackerManager.subscribe("proposal-1", "0x1234", callback);

      expect(trackerManager.getSession("proposal-1", "0x1234")).toBeDefined();
    });

    it("immediately notifies with current state", async () => {
      const { trackerManager } = await import("./proposal-tracker-manager");

      const session = trackerManager.createSession("proposal-1", "0x1234");
      session.status = "loading";

      const callback = vi.fn();
      trackerManager.subscribe("proposal-1", "0x1234", callback);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ status: "loading" })
      );
    });

    it("returns unsubscribe function", async () => {
      const { trackerManager } = await import("./proposal-tracker-manager");

      const callback = vi.fn();
      const unsubscribe = trackerManager.subscribe(
        "proposal-1",
        "0x1234",
        callback
      );

      callback.mockClear();
      unsubscribe();

      trackerManager.updateSession("proposal-1", "0x1234", {
        status: "complete",
      });

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe("subscribeGlobal", () => {
    it("notifies on global changes", async () => {
      const { trackerManager } = await import("./proposal-tracker-manager");

      const callback = vi.fn();
      trackerManager.subscribeGlobal(callback);

      // Create and start tracking
      trackerManager.createSession("proposal-1", "0x1234");
      trackerManager.requestTracking("proposal-1", "0x1234", vi.fn());

      expect(callback).toHaveBeenCalled();
    });

    it("returns unsubscribe function", async () => {
      const { trackerManager } = await import("./proposal-tracker-manager");

      const callback = vi.fn();
      const unsubscribe = trackerManager.subscribeGlobal(callback);

      unsubscribe();
      callback.mockClear();

      trackerManager.createSession("proposal-1", "0x1234");
      trackerManager.requestTracking("proposal-1", "0x1234", vi.fn());

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe("requestTracking", () => {
    it("starts tracking immediately if under max concurrent", async () => {
      const { trackerManager } = await import("./proposal-tracker-manager");

      const startFn = vi.fn();
      trackerManager.createSession("proposal-1", "0x1234");
      trackerManager.requestTracking("proposal-1", "0x1234", startFn);

      expect(startFn).toHaveBeenCalled();
      expect(trackerManager.getActiveCount()).toBe(1);
    });

    it("queues tracking when at max concurrent", async () => {
      const { trackerManager } = await import("./proposal-tracker-manager");

      // Fill up concurrent slots (max is 2)
      trackerManager.createSession("proposal-1", "0x1234");
      trackerManager.requestTracking("proposal-1", "0x1234", vi.fn());

      trackerManager.createSession("proposal-2", "0x1234");
      trackerManager.requestTracking("proposal-2", "0x1234", vi.fn());

      // This should be queued
      const queuedFn = vi.fn();
      trackerManager.createSession("proposal-3", "0x1234");
      trackerManager.requestTracking("proposal-3", "0x1234", queuedFn);

      expect(queuedFn).not.toHaveBeenCalled();
      expect(trackerManager.getQueueLength()).toBe(1);
      expect(trackerManager.isQueued("proposal-3", "0x1234")).toBe(true);
    });

    it("does not start if session does not exist", async () => {
      const { trackerManager } = await import("./proposal-tracker-manager");

      const startFn = vi.fn();
      trackerManager.requestTracking("nonexistent", "0x1234", startFn);

      expect(startFn).not.toHaveBeenCalled();
    });

    it("does not restart if already loading", async () => {
      const { trackerManager } = await import("./proposal-tracker-manager");

      const startFn1 = vi.fn();
      const startFn2 = vi.fn();

      trackerManager.createSession("proposal-1", "0x1234");
      trackerManager.requestTracking("proposal-1", "0x1234", startFn1);
      trackerManager.requestTracking("proposal-1", "0x1234", startFn2);

      expect(startFn1).toHaveBeenCalledTimes(1);
      expect(startFn2).not.toHaveBeenCalled();
    });

    it("does not restart if already complete", async () => {
      const { trackerManager } = await import("./proposal-tracker-manager");

      const session = trackerManager.createSession("proposal-1", "0x1234");
      session.status = "complete";

      const startFn = vi.fn();
      trackerManager.requestTracking("proposal-1", "0x1234", startFn);

      expect(startFn).not.toHaveBeenCalled();
    });

    it("sets queue position correctly", async () => {
      const { trackerManager } = await import("./proposal-tracker-manager");

      // Fill slots
      trackerManager.createSession("proposal-1", "0x1234");
      trackerManager.requestTracking("proposal-1", "0x1234", vi.fn());
      trackerManager.createSession("proposal-2", "0x1234");
      trackerManager.requestTracking("proposal-2", "0x1234", vi.fn());

      // Queue items
      trackerManager.createSession("proposal-3", "0x1234");
      trackerManager.requestTracking("proposal-3", "0x1234", vi.fn());

      trackerManager.createSession("proposal-4", "0x1234");
      trackerManager.requestTracking("proposal-4", "0x1234", vi.fn());

      const session3 = trackerManager.getSession("proposal-3", "0x1234");
      const session4 = trackerManager.getSession("proposal-4", "0x1234");

      expect(session3?.queuePosition).toBe(1);
      expect(session4?.queuePosition).toBe(2);
    });
  });

  describe("trackingFinished", () => {
    it("decrements active count", async () => {
      const { trackerManager } = await import("./proposal-tracker-manager");

      trackerManager.createSession("proposal-1", "0x1234");
      trackerManager.requestTracking("proposal-1", "0x1234", vi.fn());

      expect(trackerManager.getActiveCount()).toBe(1);

      trackerManager.trackingFinished("proposal-1", "0x1234");

      expect(trackerManager.getActiveCount()).toBe(0);
    });

    it("processes queue after finishing", async () => {
      const { trackerManager } = await import("./proposal-tracker-manager");

      // Fill slots
      trackerManager.createSession("proposal-1", "0x1234");
      trackerManager.requestTracking("proposal-1", "0x1234", vi.fn());
      trackerManager.createSession("proposal-2", "0x1234");
      trackerManager.requestTracking("proposal-2", "0x1234", vi.fn());

      // Queue item
      const queuedFn = vi.fn();
      trackerManager.createSession("proposal-3", "0x1234");
      trackerManager.requestTracking("proposal-3", "0x1234", queuedFn);

      expect(queuedFn).not.toHaveBeenCalled();

      // Finish one
      trackerManager.trackingFinished("proposal-1", "0x1234");

      expect(queuedFn).toHaveBeenCalled();
    });

    it("does not go below zero active count", async () => {
      const { trackerManager } = await import("./proposal-tracker-manager");

      trackerManager.createSession("proposal-1", "0x1234");
      trackerManager.trackingFinished("proposal-1", "0x1234");

      expect(trackerManager.getActiveCount()).toBe(0);
    });
  });

  describe("isTracking and isQueued", () => {
    it("isTracking returns true when loading", async () => {
      const { trackerManager } = await import("./proposal-tracker-manager");

      trackerManager.createSession("proposal-1", "0x1234");
      trackerManager.requestTracking("proposal-1", "0x1234", vi.fn());

      expect(trackerManager.isTracking("proposal-1", "0x1234")).toBe(true);
      expect(trackerManager.isQueued("proposal-1", "0x1234")).toBe(false);
    });

    it("isQueued returns true when queued", async () => {
      const { trackerManager } = await import("./proposal-tracker-manager");

      // Fill slots
      trackerManager.createSession("proposal-1", "0x1234");
      trackerManager.requestTracking("proposal-1", "0x1234", vi.fn());
      trackerManager.createSession("proposal-2", "0x1234");
      trackerManager.requestTracking("proposal-2", "0x1234", vi.fn());

      // Queue
      trackerManager.createSession("proposal-3", "0x1234");
      trackerManager.requestTracking("proposal-3", "0x1234", vi.fn());

      expect(trackerManager.isQueued("proposal-3", "0x1234")).toBe(true);
      expect(trackerManager.isTracking("proposal-3", "0x1234")).toBe(false);
    });

    it("returns false for non-existent sessions", async () => {
      const { trackerManager } = await import("./proposal-tracker-manager");

      expect(trackerManager.isTracking("nonexistent", "0x1234")).toBe(false);
      expect(trackerManager.isQueued("nonexistent", "0x1234")).toBe(false);
    });
  });

  describe("abortTracking", () => {
    it("removes from queue and resets status", async () => {
      const { trackerManager } = await import("./proposal-tracker-manager");

      // Fill slots
      trackerManager.createSession("proposal-1", "0x1234");
      trackerManager.requestTracking("proposal-1", "0x1234", vi.fn());
      trackerManager.createSession("proposal-2", "0x1234");
      trackerManager.requestTracking("proposal-2", "0x1234", vi.fn());

      // Queue
      trackerManager.createSession("proposal-3", "0x1234");
      trackerManager.requestTracking("proposal-3", "0x1234", vi.fn());

      trackerManager.abortTracking("proposal-3", "0x1234");

      const session = trackerManager.getSession("proposal-3", "0x1234");
      expect(session?.status).toBe("idle");
      expect(trackerManager.getQueueLength()).toBe(0);
    });

    it("aborts controller if tracking", async () => {
      const { trackerManager } = await import("./proposal-tracker-manager");

      const session = trackerManager.createSession("proposal-1", "0x1234");
      const abortController = new AbortController();
      session.abortController = abortController;

      trackerManager.requestTracking("proposal-1", "0x1234", vi.fn());

      const abortSpy = vi.spyOn(abortController, "abort");
      trackerManager.abortTracking("proposal-1", "0x1234");

      expect(abortSpy).toHaveBeenCalled();
    });
  });

  describe("clearSession", () => {
    it("removes session from map", async () => {
      const { trackerManager } = await import("./proposal-tracker-manager");

      trackerManager.createSession("proposal-1", "0x1234");
      trackerManager.clearSession("proposal-1", "0x1234");

      expect(trackerManager.getSession("proposal-1", "0x1234")).toBeUndefined();
    });

    it("removes from queue if queued", async () => {
      const { trackerManager } = await import("./proposal-tracker-manager");

      // Fill slots
      trackerManager.createSession("proposal-1", "0x1234");
      trackerManager.requestTracking("proposal-1", "0x1234", vi.fn());
      trackerManager.createSession("proposal-2", "0x1234");
      trackerManager.requestTracking("proposal-2", "0x1234", vi.fn());

      // Queue
      trackerManager.createSession("proposal-3", "0x1234");
      trackerManager.requestTracking("proposal-3", "0x1234", vi.fn());

      expect(trackerManager.getQueueLength()).toBe(1);

      trackerManager.clearSession("proposal-3", "0x1234");

      expect(trackerManager.getQueueLength()).toBe(0);
    });

    it("aborts and decrements if loading", async () => {
      const { trackerManager } = await import("./proposal-tracker-manager");

      const session = trackerManager.createSession("proposal-1", "0x1234");
      const abortController = new AbortController();
      session.abortController = abortController;

      trackerManager.requestTracking("proposal-1", "0x1234", vi.fn());

      const abortSpy = vi.spyOn(abortController, "abort");
      trackerManager.clearSession("proposal-1", "0x1234");

      expect(abortSpy).toHaveBeenCalled();
      expect(trackerManager.getActiveCount()).toBe(0);
    });
  });

  describe("getAllSessions", () => {
    it("returns all sessions", async () => {
      const { trackerManager } = await import("./proposal-tracker-manager");

      trackerManager.createSession("proposal-1", "0x1234");
      trackerManager.createSession("proposal-2", "0x1234");
      trackerManager.createSession("proposal-3", "0x5678");

      const sessions = trackerManager.getAllSessions();
      expect(sessions).toHaveLength(3);
    });
  });

  describe("cleanupStaleSessions", () => {
    it("removes stale complete sessions with no subscribers", async () => {
      const { trackerManager } = await import("./proposal-tracker-manager");

      const session = trackerManager.createSession("proposal-1", "0x1234");
      session.status = "complete";
      session.lastUpdatedAt = Date.now() - MS_PER_HOUR; // 1 hour ago

      const cleaned = trackerManager.cleanupStaleSessions(30 * MS_PER_MINUTE);

      expect(cleaned).toBe(1);
      expect(trackerManager.getSession("proposal-1", "0x1234")).toBeUndefined();
    });

    it("removes stale error sessions with no subscribers", async () => {
      const { trackerManager } = await import("./proposal-tracker-manager");

      const session = trackerManager.createSession("proposal-1", "0x1234");
      session.status = "error";
      session.lastUpdatedAt = Date.now() - MS_PER_HOUR;

      const cleaned = trackerManager.cleanupStaleSessions(30 * MS_PER_MINUTE);

      expect(cleaned).toBe(1);
    });

    it("does not remove sessions with subscribers", async () => {
      const { trackerManager } = await import("./proposal-tracker-manager");

      trackerManager.subscribe("proposal-1", "0x1234", vi.fn());
      const session = trackerManager.getSession("proposal-1", "0x1234");
      session!.status = "complete";
      session!.lastUpdatedAt = Date.now() - MS_PER_HOUR;

      const cleaned = trackerManager.cleanupStaleSessions(30 * MS_PER_MINUTE);

      expect(cleaned).toBe(0);
      expect(trackerManager.getSession("proposal-1", "0x1234")).toBeDefined();
    });

    it("does not remove recent sessions", async () => {
      const { trackerManager } = await import("./proposal-tracker-manager");

      const session = trackerManager.createSession("proposal-1", "0x1234");
      session.status = "complete";
      // lastUpdatedAt is recent (just created)

      const cleaned = trackerManager.cleanupStaleSessions(30 * MS_PER_MINUTE);

      expect(cleaned).toBe(0);
    });

    it("does not remove loading or idle sessions", async () => {
      const { trackerManager } = await import("./proposal-tracker-manager");

      const session1 = trackerManager.createSession("proposal-1", "0x1234");
      session1.status = "loading";
      session1.lastUpdatedAt = Date.now() - MS_PER_HOUR;

      const session2 = trackerManager.createSession("proposal-2", "0x1234");
      session2.status = "idle";
      session2.lastUpdatedAt = Date.now() - MS_PER_HOUR;

      const cleaned = trackerManager.cleanupStaleSessions(30 * MS_PER_MINUTE);

      expect(cleaned).toBe(0);
    });
  });

  describe("vote update subscriptions", () => {
    it("subscribes and receives vote updates", async () => {
      const { subscribeToVoteUpdates, emitVoteUpdate } = await import(
        "./proposal-tracker-manager"
      );

      const callback = vi.fn();
      subscribeToVoteUpdates(callback);

      const update = {
        proposalId: "123",
        governorAddress: "0x1234",
        forVotes: "1000",
        againstVotes: "500",
        abstainVotes: "100",
      };

      emitVoteUpdate(update);

      expect(callback).toHaveBeenCalledWith(update);
    });

    it("unsubscribes correctly", async () => {
      const { subscribeToVoteUpdates, emitVoteUpdate } = await import(
        "./proposal-tracker-manager"
      );

      const callback = vi.fn();
      const unsubscribe = subscribeToVoteUpdates(callback);

      unsubscribe();

      emitVoteUpdate({
        proposalId: "123",
        governorAddress: "0x1234",
        forVotes: "1000",
        againstVotes: "500",
        abstainVotes: "100",
      });

      expect(callback).not.toHaveBeenCalled();
    });

    it("handles subscriber errors gracefully", async () => {
      const { subscribeToVoteUpdates, emitVoteUpdate } = await import(
        "./proposal-tracker-manager"
      );

      const errorCallback = vi.fn(() => {
        throw new Error("Subscriber error");
      });
      const normalCallback = vi.fn();

      subscribeToVoteUpdates(errorCallback);
      subscribeToVoteUpdates(normalCallback);

      emitVoteUpdate({
        proposalId: "123",
        governorAddress: "0x1234",
        forVotes: "1000",
        againstVotes: "500",
        abstainVotes: "100",
      });

      // Normal callback should still be called even if one throws
      // Errors are logged via debug module (not console.error)
      expect(normalCallback).toHaveBeenCalled();
    });
  });
});
