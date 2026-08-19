import { expect, test } from "@playwright/test";

import { signedInPage } from "./fixtures/session";
import { TEST_SAFE_ADDRESS } from "./fixtures/testnode";
import { DEV_WALLETS } from "./fixtures/wallets";

// Covers GET /api/auth/safes and POST/DELETE /api/auth/act-as.
//
// The happy path (actually acting as a Safe) needs a Safe deployed on chain
// 412346. None is baked into the testnode image today, so it lives in the
// `testSafe` block below and is skipped until the image provides one — see
// Workstream A. The rejection paths need no Safe and run unconditionally.
test.describe("act as a Safe", () => {
  test("offers the by-address path even with an empty Safe list", async ({
    browser,
  }) => {
    // Deliberately the `candidates` key, not `profile`: the indexer only
    // remembers a Safe after a *successful* act-as, and this key owns no Safe,
    // so its recall list is permanently empty. Using the profile key here would
    // make the assertion pass only until that key first acts as a Safe — the
    // app schema keeps known_safe rows across runs.
    const page = await signedInPage(browser, "candidates");

    await page.getByTestId("act-as-trigger").click();
    await expect(page.getByTestId("act-as-safe-option")).toHaveCount(0);
    await expect(page.getByTestId("act-as-by-address")).toBeVisible();

    await page.getByTestId("act-as-by-address").click();
    await expect(page.getByTestId("act-as-safe-input")).toBeVisible();
  });

  test("rejects an address that is not a Safe (404 safe_not_found)", async ({
    browser,
  }) => {
    const page = await signedInPage(browser, "profile");

    await page.getByTestId("act-as-trigger").click();
    await page.getByTestId("act-as-by-address").click();
    // An EOA: has no code, so getOwners() reverts and the indexer 404s.
    await page
      .getByTestId("act-as-safe-input")
      .fill(DEV_WALLETS.candidates.address);
    await page.getByTestId("act-as-submit").click();

    await expect(page.getByTestId("act-as-error")).toBeVisible();
    // Dialog stays open so the reason sits next to the offending address.
    await expect(page.getByTestId("act-as-safe-input")).toBeVisible();
    // And we never entered act-as mode.
    await expect(page.getByTestId("acting-as-banner")).toHaveCount(0);
  });

  test("validates the address shape before calling the indexer", async ({
    browser,
  }) => {
    const page = await signedInPage(browser, "profile");

    await page.getByTestId("act-as-trigger").click();
    await page.getByTestId("act-as-by-address").click();
    await page.getByTestId("act-as-safe-input").fill("0xnot-an-address");

    // Submit is disabled for a malformed address — no wasted round trip.
    await expect(page.getByTestId("act-as-submit")).toBeDisabled();
  });

  // Resolved from TEST_SAFE_ADDRESS or the testnode's governance.json, so these
  // run against any stack that has baked a Safe rather than only when the env
  // var happens to be exported.
  test.describe("with a Safe on chain", () => {
    test.skip(
      !TEST_SAFE_ADDRESS,
      "no testSafe baked on this stack - run `pnpm testnode:safe` in the indexer repo"
    );

    test("switches subject, banners it, and reverts", async ({ browser }) => {
      const safe = TEST_SAFE_ADDRESS as string;
      const page = await signedInPage(browser, "profile");

      await page.getByTestId("act-as-trigger").click();
      await page.getByTestId("act-as-by-address").click();
      await page.getByTestId("act-as-safe-input").fill(safe);
      await page.getByTestId("act-as-submit").click();

      // The banner is the guard against editing the wrong entity, so assert it
      // hard: visible, naming the Safe, and present after a reload.
      const banner = page.getByTestId("acting-as-banner");
      await expect(banner).toBeVisible();
      await expect(page.getByTestId("acting-as-address")).toHaveText(
        new RegExp(safe, "i")
      );

      // The profile form must now describe the Safe as the edited subject.
      await expect(page.getByTestId("siwe-address")).toContainText(safe, {
        ignoreCase: true,
      });

      // Act-as is server-side session state, so it survives a reload.
      await page.reload();
      await expect(banner).toBeVisible();

      // The Safe is now in the recall list.
      await page.getByTestId("act-as-trigger").click();
      await expect(page.getByTestId("act-as-safe-option")).toHaveCount(1);
      await page.keyboard.press("Escape");

      await page.getByTestId("act-as-stop").click();
      await expect(banner).toHaveCount(0);
      // The indexer normalizes addresses to lowercase, so the rendered signer
      // won't match the checksummed constant byte-for-byte.
      await expect(page.getByTestId("siwe-address")).toContainText(
        DEV_WALLETS.profile.address,
        { ignoreCase: true }
      );
    });

    test("refuses a Safe the signer does not own (403 not_an_owner)", async ({
      browser,
    }) => {
      const safe = TEST_SAFE_ADDRESS as string;
      // Key #4 is not among the baked Safe's owners (#1 and #2).
      const page = await signedInPage(browser, "candidates");

      await page.getByTestId("act-as-trigger").click();
      await page.getByTestId("act-as-by-address").click();
      await page.getByTestId("act-as-safe-input").fill(safe);
      await page.getByTestId("act-as-submit").click();

      await expect(page.getByTestId("act-as-error")).toBeVisible();
      await expect(page.getByTestId("acting-as-banner")).toHaveCount(0);
    });
  });
});
