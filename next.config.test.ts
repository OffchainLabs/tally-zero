import { AsyncLocalStorage } from "node:async_hooks";
import { expect, it } from "vitest";

import nextConfig from "./next.config.mjs";

async function responseFor(path: string) {
  // Next normally installs this global during server startup.
  Object.assign(globalThis, { AsyncLocalStorage });
  const { unstable_getResponseFromNextConfig } =
    await import("next/experimental/testing/server");
  return unstable_getResponseFromNextConfig({
    url: `https://governance.example${path}`,
    nextConfig,
  });
}

// This harness evaluates next.config.mjs alone and knows nothing about app/, so
// a 200 here means "no rule rewrites or redirects this path", not "a page is
// mounted at it". The page's existence is covered by
// CandidateProfileEditor.test.tsx importing it.
it("leaves the candidate editor path unredirected", async () => {
  const response = await responseFor("/security-council/candidate");

  expect(response.status).toBe(200);
  expect(response.headers.get("location")).toBeNull();
});

it("keeps legacy election bookmarks pointing to the Security Council section", async () => {
  const response = await responseFor("/elections");

  expect(response.status).toBe(308);
  expect(response.headers.get("location")).toBe(
    "https://governance.example/security-council"
  );
});

it("keeps the address when redirecting legacy contender bookmarks", async () => {
  const address = "0x1111111111111111111111111111111111111111";
  const response = await responseFor(`/elections/contender/${address}`);

  expect(response.status).toBe(308);
  expect(response.headers.get("location")).toBe(
    `https://governance.example/security-council/contender/${address}`
  );
});
