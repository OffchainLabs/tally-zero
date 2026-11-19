import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("environment validation", () => {
  beforeEach(() => {
    vi.resetModules();
    // Exercise the real loader rather than Vitest's validation bypass.
    vi.stubEnv("VITEST", undefined);
    vi.stubEnv("NEXT_PUBLIC_REOWN_PROJECT_ID", "test-project-id");
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_TOKEN", undefined);
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", undefined);
    vi.stubEnv("NEXT_PUBLIC_ALCHEMY_API_KEY", undefined);
    vi.stubEnv("NEXT_PUBLIC_SIWE_CHAIN_ID", undefined);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("loads valid values and coerces the SIWE chain ID", async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "https://example.com");
    vi.stubEnv("NEXT_PUBLIC_SIWE_CHAIN_ID", "42161");

    const { env } = await import("./env");

    expect(env.NEXT_PUBLIC_REOWN_PROJECT_ID).toBe("test-project-id");
    expect(env.NEXT_PUBLIC_POSTHOG_HOST).toBe("https://example.com");
    expect(env.NEXT_PUBLIC_SIWE_CHAIN_ID).toBe(42161);
  });

  it("rejects a missing required project ID", async () => {
    vi.stubEnv("NEXT_PUBLIC_REOWN_PROJECT_ID", undefined);

    await expect(import("./env")).rejects.toThrow(
      "Invalid environment variables"
    );
  });

  it("rejects an invalid optional URL", async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "not-a-url");

    await expect(import("./env")).rejects.toThrow(
      "Invalid environment variables"
    );
  });

  it("rejects an invalid SIWE chain ID", async () => {
    vi.stubEnv("NEXT_PUBLIC_SIWE_CHAIN_ID", "-1");

    await expect(import("./env")).rejects.toThrow(
      "Invalid environment variables"
    );
  });

  it("still skips validation when the Vitest flag is set", async () => {
    vi.stubEnv("VITEST", "true");
    vi.stubEnv("NEXT_PUBLIC_REOWN_PROJECT_ID", undefined);
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "not-a-url");

    const { env } = await import("./env");

    expect(env.NEXT_PUBLIC_REOWN_PROJECT_ID).toBeUndefined();
    expect(env.NEXT_PUBLIC_POSTHOG_HOST).toBe("not-a-url");
  });
});
