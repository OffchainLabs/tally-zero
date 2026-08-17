import type { Browser, Page } from "@playwright/test";

import { AUTH_WALLETS, type AuthWalletName, authFile } from "./auth";
import type { DevWallet } from "./wallets";

// The SIWE sign-in controls live on the delegate registration page — SiweGate
// renders `siwe-sign-in` there, and the form behind it renders `siwe-address`.
// /profile was retired in favour of this route.
const SIGN_IN_PATH = "/delegates/register";

/**
 * Inject a dev key so TestWalletProvider auto-connects it as a signing wallet.
 * Must run before the first navigation — the provider reads the global on mount.
 */
export async function useWallet(page: Page, wallet: DevWallet): Promise<void> {
  await page.addInitScript((key) => {
    (
      window as unknown as { __TEST_WALLET_KEY__?: string }
    ).__TEST_WALLET_KEY__ = key;
  }, wallet.key);
}

/**
 * Connect `wallet` and complete the SIWE handshake through the UI.
 *
 * Costs a nonce, and POST /api/auth/nonce allows only 10 per minute across the
 * whole suite — so this is for the setup project, which runs once per wallet.
 * Specs should use signedInPage() instead.
 */
export async function signIn(page: Page, wallet: DevWallet): Promise<void> {
  await useWallet(page, wallet);
  await page.goto(SIGN_IN_PATH);
  await page.getByTestId("siwe-sign-in").click();
  await page
    .getByTestId("siwe-address")
    .waitFor({ state: "visible", timeout: 15_000 });
}

/**
 * A page already signed in as `name`, on `path`.
 *
 * Replays the session cookie captured by the setup project instead of signing
 * in again, so it costs no nonce and a spec can use as many wallets and tests
 * as it likes. The wallet key is still injected because connection state is
 * client-side: the cookie authenticates, the key makes the app consider a
 * wallet connected.
 */
export async function signedInPage(
  browser: Browser,
  name: AuthWalletName,
  path = SIGN_IN_PATH
): Promise<Page> {
  const context = await browser.newContext({ storageState: authFile(name) });
  const page = await context.newPage();
  await useWallet(page, AUTH_WALLETS[name]);
  await page.goto(path);
  return page;
}
