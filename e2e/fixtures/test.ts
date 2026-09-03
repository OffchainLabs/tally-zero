import {
  type BrowserContext,
  type Page,
  test as base,
  expect,
} from "@playwright/test";

import { AUTH_WALLETS, type AuthWalletName, authFile } from "./auth";
import { REGISTER_PATH, useWallet } from "./session";

/** Opens a page already signed in as `name`, on `path`. */
type SignedInPage = (name: AuthWalletName, path?: string) => Promise<Page>;

/**
 * The spec-facing `test`, carrying the `signedInPage` fixture.
 *
 * `signedInPage(name)` replays the session cookie the setup project captured
 * instead of signing in again, so it costs no nonce and a spec can use as many
 * wallets and tests as it likes. The wallet key is still injected because
 * connection state is client-side: the cookie authenticates, the key makes the
 * app consider a wallet connected.
 *
 * It is a fixture rather than a plain helper so the context behind each page is
 * closed in teardown. A spec can call it once per wallet it needs.
 */
export const test = base.extend<{ signedInPage: SignedInPage }>({
  signedInPage: async ({ browser }, use) => {
    const contexts: BrowserContext[] = [];

    await use(async (name, path = REGISTER_PATH) => {
      const context = await browser.newContext({
        storageState: authFile(name),
      });
      contexts.push(context);
      const page = await context.newPage();
      await useWallet(page, AUTH_WALLETS[name]);
      await page.goto(path);
      return page;
    });

    for (const context of contexts) await context.close();
  },
});

export { expect };
