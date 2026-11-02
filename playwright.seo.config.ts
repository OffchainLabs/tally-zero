/* eslint-disable no-process-env */
import { defineConfig, devices } from "@playwright/test";

// Run with `pnpm test:seo` so these checks use production prerendering.
// They do not require the chain/indexer/Postgres stack used by the SIWE suite.
const port = Number(process.env.SEO_TEST_PORT ?? 3092);
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: "./e2e",
  testMatch: "seo.spec.ts",
  workers: 1,
  timeout: 30_000,
  use: {
    ...devices["Desktop Chrome"],
    baseURL,
    trace: "retain-on-failure",
  },
  webServer: {
    command: `pnpm exec next start --port ${port}`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
