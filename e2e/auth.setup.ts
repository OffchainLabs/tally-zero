import { existsSync } from "node:fs";

import {
  type Browser,
  type BrowserContext,
  test as setup,
} from "@playwright/test";

import { AUTH_WALLETS, type AuthWalletName, authFile } from "./fixtures/auth";
import { signIn } from "./fixtures/session";

// Runs once before the suite as the `setup` project. Each wallet signs in
// through the real UI (so nonce -> verify -> cookie is still exercised) and its
// session cookie is written to disk for the specs to replay.
//
// Two things keep the suite under the 10/min per-IP nonce limit:
//   1. sign-in happens per *wallet*, not per test, so adding tests is free;
//   2. a saved session is reused while it is still valid, so repeated runs on
//      one machine cost no nonces at all. Sessions last 7 days on a sliding
//      window, so in practice only the first run of the week pays.
// Without (2), a run still spends one nonce per wallet, and two runs inside a
// minute trip the limit.
//
// Budget, with the wallet map at five entries: a cold run costs 1 (global-setup
// readiness probe) + 5 (here) + 1 (the sign-out spec, which needs its own
// session) = 7; a warm run costs 1 + 0 + 1 = 2.
async function sessionStillValid(
  browser: Browser,
  name: AuthWalletName
): Promise<boolean> {
  if (!existsSync(authFile(name))) return false;
  let context: BrowserContext | undefined;
  try {
    // newContext() itself throws on a saved state that exists but does not
    // parse (a partial write from an interrupted run, say), so it has to be
    // inside the try for that to mean "re-authenticate" rather than "fail".
    context = await browser.newContext({ storageState: authFile(name) });
    // 200 means the cookie still resolves to a live session; 401 means expired
    // or truncated away (e.g. by `pnpm reset:siwe`).
    const response = await context.request.get(
      "/api/governance-indexer/api/me"
    );
    return response.status() === 200;
  } catch {
    return false;
  } finally {
    await context?.close();
  }
}

for (const name of Object.keys(AUTH_WALLETS) as AuthWalletName[]) {
  setup(`authenticate ${name}`, async ({ browser, page }) => {
    if (await sessionStillValid(browser, name)) return;

    // signIn() already waits for the signed-in state before returning.
    await signIn(page, AUTH_WALLETS[name]);
    await page.context().storageState({ path: authFile(name) });
  });
}
