import { expect, test } from "@playwright/test";

const ORIGIN = "https://alt.gov.arbitrum.foundation";
const PROPOSAL_PATH =
  "/proposal/101924107818180443784046677916233531742645798596604549673138282938475874935972";
const PROPOSAL_TITLE =
  "[Constitutional AIP] Activate Arbitrum BoLD + Infura Nova Validator Whitelist";
const ADDRESS = "0x00aC614D118f972A50973eE5B9d70c3594eB4c2D";

test.beforeEach(async ({ context, baseURL }) => {
  // Keep rendering checks independent of external RPCs, analytics, and wallets.
  await context.route("**/*", (route) =>
    new URL(route.request().url()).origin === baseURL
      ? route.continue()
      : route.abort()
  );
});

test.describe("production HTML", () => {
  test.use({ javaScriptEnabled: false });

  for (const { path, text } of [
    { path: "/proposals", text: "My Drafts" },
    { path: "/delegates", text: "View voting power distribution" },
    { path: "/privacy", text: "This Privacy Policy applies" },
    { path: "/tos", text: "ARBITRUM GOVERNANCE PLATFORM TERMS" },
    { path: PROPOSAL_PATH, text: PROPOSAL_TITLE },
  ]) {
    test(`SSR content for ${path}`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
      await expect(page.locator("main")).toContainText(text);
      await expect(
        page.getByRole("button", { name: "Connect Wallet" })
      ).toBeVisible();
      await expect(page.locator("footer")).toContainText("Privacy Policy");
    });
  }

  test("home Open Graph includes its preview image", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
      "content",
      `${ORIGIN}/opengraph-image.jpg`
    );
    await expect(
      page.locator('meta[property="og:image:width"]')
    ).toHaveAttribute("content", "2400");
    await expect(page.locator('meta[property="og:type"]')).toHaveAttribute(
      "content",
      "website"
    );
  });

  for (const section of ["delegates", "security-council/contender"]) {
    test(`profile canonicals for ${section}`, async ({ page }) => {
      await page.goto(`/${section}/${ADDRESS}?ref=seo`);
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
        "href",
        `${ORIGIN}/${section}/${ADDRESS.toLowerCase()}`
      );
    });
  }

  test("account-bound pages stay noindex", async ({ page }) => {
    for (const path of [
      "/drafts",
      "/proposal/new",
      "/delegates/register",
      "/delegates/my-delegation",
    ]) {
      await page.goto(path);
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
        "content",
        "noindex, follow"
      );
      await expect(page.locator('meta[name="googlebot"]')).toHaveCount(0);
    }
  });
});

test("proposal tabs hydrate and follow browser history", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${PROPOSAL_PATH}?tab=payload`);

  const payload = page.getByRole("tab", { name: "Payload", exact: true });
  const description = page.getByRole("tab", {
    name: "Description",
    exact: true,
  });
  await expect(payload).toHaveAttribute("data-state", "active");
  await expect(
    page.getByRole("button", { name: "Connect Wallet" })
  ).toBeVisible();

  // Next.js observes native history changes as well as router navigation.
  await page.evaluate(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete("tab");
    window.history.pushState(null, "", url);
  });
  await expect(description).toHaveAttribute("data-state", "active");
  await page.goBack();
  await expect(payload).toHaveAttribute("data-state", "active");

  await description.click();
  await expect(description).toHaveAttribute("data-state", "active");
  await expect(page).not.toHaveURL(/tab=/);
  expect(errors).toEqual([]);
});
