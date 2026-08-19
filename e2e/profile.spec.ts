import { expect, test } from "@playwright/test";

import { useLocalStack } from "./fixtures/network";

// anvil dev key #1 (funded + DELEGATED on the local governance testnode — it has
// voting power, which the avatar-upload gate requires; a zero-power key would 403).
// A distinct key keeps this test's profile isolated from other local experiments.
const TEST_WALLET_KEY =
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const TEST_WALLET_ADDRESS = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

// 1x1 transparent PNG.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64"
);

test("user signs in and manages their profile end-to-end", async ({ page }) => {
  await useLocalStack(page);
  // Inject a deterministic test wallet; TestWalletProvider auto-connects it.
  await page.addInitScript((key) => {
    (
      window as unknown as { __TEST_WALLET_KEY__?: string }
    ).__TEST_WALLET_KEY__ = key;
  }, TEST_WALLET_KEY);

  await page.goto("/delegates/register");

  // Connected → sign in with a wallet signature (no gas, no tx).
  await page.getByTestId("siwe-sign-in").click();

  // Signed in → editor shows the connected address.
  await expect(page.getByTestId("siwe-address")).toContainText("0x7099");

  const name = `E2E Delegate ${Date.now()}`;
  await page.getByTestId("profile-name").fill(name);
  await page.getByTestId("profile-bio").fill("Bio set via Playwright e2e.");
  await page.getByTestId("profile-twitter").fill("e2e_delegate");

  // Upload an avatar → the route stores it and commits `picture` itself, so the
  // preview renders from the refreshed session rather than from form state.
  // The input is visually hidden behind an "Upload" button, so target it directly.
  await page.getByTestId("profile-avatar-input").setInputFiles({
    name: "avatar.png",
    mimeType: "image/png",
    buffer: PNG,
  });
  await expect(page.getByTestId("profile-avatar-preview")).toBeVisible();

  // Display name is the only required field; submit navigates to the public
  // profile on success.
  await page.getByTestId("profile-save").click();
  await expect(page.getByText("Profile saved.")).toBeVisible();
  await expect(page).toHaveURL(
    new RegExp(`/delegates/${TEST_WALLET_ADDRESS}`, "i")
  );

  // Persistence: submit redirects away, so come back (the session cookie
  // survives) and then reload, which is what a returning delegate does.
  await page.goto("/delegates/register");
  await expect(page.getByTestId("profile-name")).toHaveValue(name);
  await expect(page.getByTestId("profile-avatar-preview")).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("profile-name")).toHaveValue(name);

  // And the public resolved profile reflects the owned edits + hosted avatar.
  const res = await page.request.get(
    `/api/governance-indexer/api/profiles/${TEST_WALLET_ADDRESS}`
  );
  expect(res.ok()).toBeTruthy();
  const profile = (await res.json()) as {
    name: string | null;
    twitter: string | null;
    picture: string | null;
  };
  expect(profile.name).toBe(name);
  expect(profile.twitter).toBe("e2e_delegate");
  expect(profile.picture).toContain("/uploads/avatars/");

  // Sign out clears the session.
  await page.getByTestId("siwe-sign-out").click();
  await expect(page.getByTestId("siwe-sign-in")).toBeVisible();
});
