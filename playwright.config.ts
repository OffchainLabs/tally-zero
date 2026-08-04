/* eslint-disable no-process-env */
import { defineConfig, devices } from "@playwright/test";

// Full-stack SIWE e2e. Requires the local backend stack (chain 412346 + indexer
// + Postgres) already running — bring it up from the indexer repo with
// `pnpm start:local` (see e2e/global-setup.ts, which fails fast otherwise).
// Stage 4 (CI) wires the backend boot around this.
const PORT = Number(process.env.PORT ?? 3000);
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? "line" : "list",
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm dev",
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      PORT: String(PORT),
      NEXT_PUBLIC_REOWN_PROJECT_ID:
        process.env.NEXT_PUBLIC_REOWN_PROJECT_ID ?? "test",
      GOVERNANCE_INDEXER_URL:
        process.env.GOVERNANCE_INDEXER_URL ?? "http://localhost:42069",
      NEXT_PUBLIC_SIWE_CHAIN_ID:
        process.env.NEXT_PUBLIC_SIWE_CHAIN_ID ?? "412346",
      STORAGE_DRIVER: process.env.STORAGE_DRIVER ?? "local",
    },
  },
});
