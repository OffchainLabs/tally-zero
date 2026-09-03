import type { Page } from "@playwright/test";

import type { DevWallet } from "./wallets";

// The SIWE gate (and so the sign-in control) is mounted on the delegate
// registration page (see components/delegate/DelegateRegistrationForm.tsx).
export const REGISTER_PATH = "/delegates/register";

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
 * Specs should use the `signedInPage` fixture instead (see ./test.ts); the one
 * exception is a spec that is testing the handshake or sign-out itself, which
 * needs a session of its own to spend.
 */
export async function signIn(page: Page, wallet: DevWallet): Promise<void> {
  await useWallet(page, wallet);
  await page.goto(REGISTER_PATH);
  await page.getByTestId("siwe-sign-in").click();
  await page
    .getByTestId("siwe-address")
    .waitFor({ state: "visible", timeout: 15_000 });
}
