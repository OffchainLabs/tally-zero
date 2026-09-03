import { signIn } from "./fixtures/session";
import { expect, test } from "./fixtures/test";
import { DEV_WALLETS } from "./fixtures/wallets";

// The `profile` wallet is funded and DELEGATED on the local governance testnode,
// so it has voting power, which the avatar-upload gate requires; a zero-power
// key would 403. Its session is captured once by the setup project.
const PROFILE = DEV_WALLETS.profile;

// 1x1 transparent PNG.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64"
);

test("delegate manages their profile end-to-end", async ({ signedInPage }) => {
  // Replays the saved session rather than signing in, so this test costs no
  // nonce. The handshake itself is still covered, because the setup project
  // performs a real nonce -> verify -> cookie sign-in for every wallet.
  const page = await signedInPage("profile");

  // The editor shows the connected address, so the replayed cookie resolved to
  // a live session.
  await expect(page.getByTestId("siwe-address")).toContainText(
    PROFILE.address.slice(0, 6)
  );

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
    new RegExp(`/delegates/${PROFILE.address}`, "i")
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
    `/api/governance-indexer/api/profiles/${PROFILE.address}`
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
});

test("signing out clears the session", async ({ page }) => {
  // The one spec that signs in for itself, so it costs one nonce. Sign-out
  // destroys the session it signs out of, so it uses a wallet outside
  // AUTH_WALLETS: spending a session the setup project saved would send that
  // wallet back through the handshake on every run.
  await signIn(page, DEV_WALLETS.signOut);

  await page.getByTestId("siwe-sign-out").click();
  await expect(page.getByTestId("siwe-sign-in")).toBeVisible();
});
