import { describe, expect, it } from "vitest";

import {
  DEFAULT_RPC_ENDPOINTS,
  getRpcHealthSummary,
  RpcHealthResult,
} from "./rpc-health";

describe("rpc-health", () => {
  describe("DEFAULT_RPC_ENDPOINTS", () => {
    it("has three endpoints", () => {
      expect(DEFAULT_RPC_ENDPOINTS).toHaveLength(3);
    });

    it("has Arbitrum One endpoint", () => {
      const arb1 = DEFAULT_RPC_ENDPOINTS.find((e) => e.id === "arb1");
      expect(arb1).toBeDefined();
      expect(arb1?.name).toBe("Arbitrum One");
      expect(arb1?.chainId).toBe(42161);
      expect(arb1?.required).toBe(true);
    });

    it("has Arbitrum Nova endpoint", () => {
      const nova = DEFAULT_RPC_ENDPOINTS.find((e) => e.id === "nova");
      expect(nova).toBeDefined();
      expect(nova?.name).toBe("Arbitrum Nova");
      expect(nova?.chainId).toBe(42170);
      expect(nova?.required).toBe(false);
    });

    it("has Ethereum endpoint", () => {
      const l1 = DEFAULT_RPC_ENDPOINTS.find((e) => e.id === "l1");
      expect(l1).toBeDefined();
      expect(l1?.name).toBe("Ethereum");
      expect(l1?.chainId).toBe(1);
      expect(l1?.required).toBe(false);
    });

    it("only Arbitrum One is required", () => {
      const required = DEFAULT_RPC_ENDPOINTS.filter((e) => e.required);
      expect(required).toHaveLength(1);
      expect(required[0].id).toBe("arb1");
    });

    it("all endpoints have valid URLs", () => {
      DEFAULT_RPC_ENDPOINTS.forEach((endpoint) => {
        expect(endpoint.url).toBeDefined();
        expect(typeof endpoint.url).toBe("string");
      });
    });
  });

  describe("getRpcHealthSummary", () => {
    const createMockResult = (
      id: "arb1" | "nova" | "l1",
      status: "checking" | "healthy" | "degraded" | "down"
    ): RpcHealthResult => ({
      id,
      name:
        id === "arb1" ? "Arbitrum One" : id === "nova" ? "Nova" : "Ethereum",
      url: `https://${id}.example.com`,
      status,
    });

    it("returns all healthy when all endpoints are healthy", () => {
      const results: RpcHealthResult[] = [
        createMockResult("arb1", "healthy"),
        createMockResult("nova", "healthy"),
        createMockResult("l1", "healthy"),
      ];

      const summary = getRpcHealthSummary(results);

      expect(summary.allHealthy).toBe(true);
      expect(summary.requiredHealthy).toBe(true);
      expect(summary.healthyCount).toBe(3);
      expect(summary.totalCount).toBe(3);
    });

    it("returns requiredHealthy true if arb1 is healthy", () => {
      const results: RpcHealthResult[] = [
        createMockResult("arb1", "healthy"),
        createMockResult("nova", "down"),
        createMockResult("l1", "down"),
      ];

      const summary = getRpcHealthSummary(results);

      expect(summary.allHealthy).toBe(false);
      expect(summary.requiredHealthy).toBe(true);
      expect(summary.healthyCount).toBe(1);
    });

    it("returns requiredHealthy true if arb1 is degraded", () => {
      const results: RpcHealthResult[] = [
        createMockResult("arb1", "degraded"),
        createMockResult("nova", "down"),
        createMockResult("l1", "down"),
      ];

      const summary = getRpcHealthSummary(results);

      expect(summary.requiredHealthy).toBe(true);
    });

    it("returns requiredHealthy false if arb1 is down", () => {
      const results: RpcHealthResult[] = [
        createMockResult("arb1", "down"),
        createMockResult("nova", "healthy"),
        createMockResult("l1", "healthy"),
      ];

      const summary = getRpcHealthSummary(results);

      expect(summary.requiredHealthy).toBe(false);
      expect(summary.healthyCount).toBe(2);
    });

    it("considers degraded as healthy for allHealthy check", () => {
      const results: RpcHealthResult[] = [
        createMockResult("arb1", "degraded"),
        createMockResult("nova", "degraded"),
        createMockResult("l1", "degraded"),
      ];

      const summary = getRpcHealthSummary(results);

      expect(summary.allHealthy).toBe(true);
      // healthyCount only counts "healthy", not "degraded"
      expect(summary.healthyCount).toBe(0);
    });

    it("handles empty results", () => {
      const results: RpcHealthResult[] = [];

      const summary = getRpcHealthSummary(results);

      expect(summary.allHealthy).toBe(true);
      // requiredHealthy is false when arb1 result is missing
      expect(summary.requiredHealthy).toBe(false);
      expect(summary.healthyCount).toBe(0);
      expect(summary.totalCount).toBe(0);
    });

    it("handles checking status as not healthy", () => {
      const results: RpcHealthResult[] = [
        createMockResult("arb1", "checking"),
        createMockResult("nova", "healthy"),
        createMockResult("l1", "healthy"),
      ];

      const summary = getRpcHealthSummary(results);

      expect(summary.allHealthy).toBe(false);
      expect(summary.requiredHealthy).toBe(false);
      expect(summary.healthyCount).toBe(2);
    });

    it("counts only healthy status in healthyCount", () => {
      const results: RpcHealthResult[] = [
        createMockResult("arb1", "healthy"),
        createMockResult("nova", "degraded"),
        createMockResult("l1", "down"),
      ];

      const summary = getRpcHealthSummary(results);

      expect(summary.healthyCount).toBe(1);
      expect(summary.totalCount).toBe(3);
    });

    it("returns correct totalCount", () => {
      const results: RpcHealthResult[] = [
        createMockResult("arb1", "healthy"),
        createMockResult("nova", "healthy"),
      ];

      const summary = getRpcHealthSummary(results);

      expect(summary.totalCount).toBe(2);
    });
  });
});
