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
  projects: [
    // Signs each dev wallet in once and saves its session cookie. Specs replay
    // that state instead of signing in themselves — POST /api/auth/nonce is
    // limited to 10/min per IP and every test shares one IP, so per-test
    // sign-in does not scale past a handful of tests.
    // Same context config as `chromium`, so sessions are captured under the
    // conditions the specs replay them into.
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["setup"],
    },
  ],
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
      // The local testnode pair (L1 1337, L2 412346) the backend runs on.
      NEXT_PUBLIC_LOCAL_CHAINS: process.env.NEXT_PUBLIC_LOCAL_CHAINS ?? "1",
      NEXT_PUBLIC_LOCAL_L1_RPC:
        process.env.NEXT_PUBLIC_LOCAL_L1_RPC ?? "http://127.0.0.1:8545",
      NEXT_PUBLIC_LOCAL_L2_RPC:
        process.env.NEXT_PUBLIC_LOCAL_L2_RPC ?? "http://127.0.0.1:8547",
      NEXT_PUBLIC_STAGES_SOURCE:
        process.env.NEXT_PUBLIC_STAGES_SOURCE ?? "gov-tracker",
    },
  },
});
