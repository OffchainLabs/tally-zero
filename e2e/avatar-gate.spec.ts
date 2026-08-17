import { expect, test } from "@playwright/test";

import { signedInPage } from "./fixtures/session";

// 1x1 transparent PNG — small enough to be well under the 2MB cap, and real PNG
// bytes so it survives the server's content sniffing.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64"
);

// Covers POST /api/me/avatar-intent's 401 and 403 branches, which the happy path
// in profile.spec.ts cannot reach.
//
// The 429 branch is deliberately NOT covered. Reaching it means exhausting the
// real per-address limiter with a key that *is* a delegate, which would leave
// that key rate-limited for the rest of the run and make the suite's result
// depend on test order. It stays covered by the indexer's own unit tests.
test.describe("avatar upload gate", () => {
  test("refuses an address with no delegated voting power (403)", async ({
    browser,
  }) => {
    // The `noVotingPower` key holds ARB but has delegated all of it away, so the
    // indexer's delegatedVotesCount is 0. It is the only dev key that can take
    // this branch — every other funded key is a delegate.
    const page = await signedInPage(browser, "noVotingPower");

    await page.getByTestId("profile-avatar-input").setInputFiles({
      name: "avatar.png",
      mimeType: "image/png",
      buffer: PNG,
    });

    await expect(
      page.getByText(/Uploading an avatar requires at least 5,000 ARB/)
    ).toBeVisible();
    // Rejected before storage, so nothing is attached to the profile.
    await expect(page.getByTestId("profile-avatar-preview")).toHaveCount(0);
  });

  test("authorizes before inspecting the file at all", async ({ browser }) => {
    const page = await signedInPage(browser, "noVotingPower");

    // A plain text file would be a 400 for a delegate. This key is not one, so
    // the delegate check is what surfaces — proving the gate runs first and an
    // unauthorized caller cannot make the server read its upload.
    const res = await page.request.post("/api/profile/avatar", {
      multipart: {
        file: {
          name: "not-an-image.txt",
          mimeType: "text/plain",
          buffer: Buffer.from("definitely not a png"),
        },
      },
    });

    expect(res.status()).toBe(403);
  });

  test("requires a session (401)", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    const res = await page.request.post("/api/profile/avatar", {
      multipart: {
        file: { name: "avatar.png", mimeType: "image/png", buffer: PNG },
      },
    });

    expect(res.status()).toBe(401);
    await context.close();
  });
});
